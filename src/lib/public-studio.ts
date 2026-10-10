import { Prisma } from "@prisma/client";
import { cache } from "react";
import { createBooking, findSellablePackages, findUsablePackages } from "@/lib/bookings";
import { listClassSessions } from "@/lib/class-sessions";
import { ApiError } from "@/lib/http";
import { instructorName } from "@/lib/instructors";
import { prisma } from "@/lib/prisma";
import type { MediaInput } from "@/lib/cloudinary";
import { paymentState } from "@/lib/online-payments";
import {
  type OnlinePayment,
  assertPaymentAllowed,
  assertPendingPurchasesLimit,
  identifyPublicMember,
  newAccessToken,
  notifyOnlinePurchase,
  withReceiptUpload
} from "@/lib/online-plans";
import { notifyPublicBooking } from "@/lib/studio-notifications";
import { addDaysToKey, dateToDateKey, daysBetweenKeys, studioNow, timeKeyToMinutes } from "@/lib/studio-time";

// Pagina publica del estudio (spec 008) y reserva web (spec 009). Todo lo que
// sale de aqui lo ve cualquiera: nunca se devuelven datos de clientes.

export const PUBLIC_SCHEDULE_DAYS = 7;
export const PUBLIC_BOOKING_DAYS = 14;

/** El negocio publicado con ese slug, o null (la pagina responde 404). */
export const getPublishedStudio = cache(async (slug: string) => {
  const client = await prisma.client.findFirst({
    where: { slug: slug.toLowerCase(), paginaPublicaActiva: true, moduloEstudio: true, deletedAt: null },
    select: {
      id: true,
      businessName: true,
      telefono: true,
      slug: true,
      paymentMethodItems: true,
      horasCancelacion: true,
      portadaUrl: true,
      permitirPagoEnEstudio: true,
      exigirPagoValidado: true
    }
  });
  if (!client) return null;

  return {
    ...client,
    paymentMethods: Array.isArray(client.paymentMethodItems)
      ? (client.paymentMethodItems as Array<{ name?: unknown; account?: unknown }>)
          .map((item) => ({ name: String(item?.name ?? "").trim(), account: String(item?.account ?? "").trim() }))
          .filter((item) => item.name || item.account)
      : []
  };
});

export type PublishedStudio = NonNullable<Awaited<ReturnType<typeof getPublishedStudio>>>;

export async function getPublicCatalog(clientId: string) {
  const disciplines = await prisma.discipline.findMany({
    where: { clientId, deletedAt: null, activa: true },
    select: {
      id: true,
      tipo: true,
      nombre: true,
      descripcion: true,
      color: true,
      imagenUrl: true,
      comboItems: { where: { discipline: { deletedAt: null } }, select: { discipline: { select: { nombre: true } } } },
      packages: {
        where: { deletedAt: null, activo: true, visiblePublico: true },
        select: { id: true, nombre: true, clases: true, precio: true, vigenciaDias: true },
        orderBy: [{ clases: "asc" }, { orden: "asc" }]
      }
    },
    orderBy: [{ tipo: "asc" }, { orden: "asc" }, { createdAt: "asc" }]
  });

  return disciplines
    .filter((discipline) => discipline.packages.length > 0 || discipline.tipo === "CLASE")
    .map(({ comboItems, packages, ...discipline }) => ({
      ...discipline,
      incluye: comboItems.map((item) => item.discipline.nombre),
      packages: packages.map((item) => ({ ...item, precio: Number(item.precio) }))
    }));
}

/** Clases de los proximos dias con cupos libres, sin ningun dato de quien reservo. */
export async function getPublicSchedule(clientId: string, days = PUBLIC_SCHEDULE_DAYS, instant = new Date()) {
  const now = studioNow(instant);
  const sessions = await listClassSessions(clientId, now.dateKey, addDaysToKey(now.dateKey, days - 1));

  return sessions
    .filter((session) => !(session.fecha === now.dateKey && timeKeyToMinutes(session.horaInicio) <= now.minutes))
    .map((session) => ({
      scheduleId: session.scheduleId,
      fecha: session.fecha,
      horaInicio: session.horaInicio,
      horaFin: session.horaFin,
      instructor: session.instructor,
      discipline: session.discipline,
      cancelada: session.cancelada,
      cuposLibres: Math.max(session.cupo - session.reservadas, 0)
    }));
}

export type PublicSession = Awaited<ReturnType<typeof getPublicSchedule>>[number];

export type PublicBookingInput = {
  scheduleId: string;
  fecha: string;
  celular?: string;
  nombre?: string;
  apellido?: string | null;
  packageId?: string;
  /** Spec 021 R9: identidad desde el enlace Mi plan. */
  planToken?: string;
  /** Spec 021 R5. */
  vistaPrevia?: boolean;
  /** Spec 021 R6. */
  pago?: OnlinePayment;
};

type PublicMember = { id: string; nombre: string; deletedAt: Date | null };

/** Con "Esperar a validar el pago" (spec 021 D3), un plan en linea sin pagar no reserva. */
function awaitsValidation(item: { origen: string; precio: unknown; pagado: unknown }) {
  return item.origen === "PUBLICO" && Number(item.pagado) < Number(item.precio);
}

const IN_REVIEW_MESSAGE = "Tu pago está en revisión. Podrás reservar cuando el estudio lo valide.";

/**
 * Lo comun a reservar (spec 009) y anotarse en la lista de espera (spec 015):
 * estudio publicado, clase dentro de la ventana y sin empezar, identidad por
 * celular y nombre (o por el enlace Mi plan, spec 021) y los planes que le
 * sirven. No escribe nada.
 */
export async function preparePublicRequest(slug: string, input: PublicBookingInput, instant: Date) {
  const studio = await getPublishedStudio(slug);
  if (!studio) throw new ApiError(404, "Estudio no encontrado");

  const now = studioNow(instant);
  const daysAhead = daysBetweenKeys(now.dateKey, input.fecha);
  if (daysAhead < 0 || daysAhead >= PUBLIC_BOOKING_DAYS) {
    throw new ApiError(422, `Solo se puede reservar desde hoy y hasta ${PUBLIC_BOOKING_DAYS} días adelante`);
  }

  const schedule = await prisma.classSchedule.findFirst({
    where: { id: input.scheduleId, clientId: studio.id, deletedAt: null, activo: true },
    select: { disciplineId: true, horaInicio: true, cupo: true }
  });
  if (!schedule) throw new ApiError(404, "Clase no encontrada");

  const stored = await prisma.classSession.findFirst({
    where: { scheduleId: input.scheduleId, fecha: new Date(`${input.fecha}T00:00:00.000Z`) },
    select: { horaInicio: true }
  });
  const horaInicio = stored?.horaInicio ?? schedule.horaInicio;
  if (daysAhead === 0 && timeKeyToMinutes(horaInicio) <= now.minutes) {
    throw new ApiError(422, "Esa clase ya empezó");
  }

  let celular: string;
  let member: PublicMember | null;
  let planId: string | null = null;
  if (input.planToken) {
    const plan = await prisma.memberPackage.findUnique({
      where: { accessToken: input.planToken },
      select: { id: true, clientId: true, member: { select: { id: true, nombre: true, celular: true, deletedAt: true } } }
    });
    if (!plan || plan.clientId !== studio.id || plan.member.deletedAt) throw new ApiError(404, "Plan no encontrado");
    celular = plan.member.celular;
    member = plan.member;
    planId = plan.id;
  } else {
    ({ celular, member } = await identifyPublicMember(studio.id, input.celular ?? "", input.nombre ?? ""));
  }

  const found =
    member && !member.deletedAt
      ? await findUsablePackages(prisma, {
          clientId: studio.id,
          memberId: member.id,
          disciplineId: schedule.disciplineId,
          fecha: input.fecha
        })
      : [];
  let usable = planId ? found.filter((item) => item.id === planId) : found;
  if (planId && !usable.length) throw new ApiError(422, "Tu plan no sirve para esta clase (otra disciplina, vencido o sin clases)");
  if (studio.exigirPagoValidado) {
    const validated = usable.filter((item) => !awaitsValidation(item));
    if (usable.length && !validated.length) throw new ApiError(409, IN_REVIEW_MESSAGE);
    usable = validated;
  }

  let needsPackage: ReturnType<typeof packageOptions> | null = null;
  if (!usable.length) {
    const options = await findSellablePackages(studio.id, schedule.disciplineId, { onlyPublic: true });
    if (!input.packageId) needsPackage = packageOptions(options, studio);
    else if (!options.some((item) => item.id === input.packageId)) {
      throw new ApiError(422, "Ese paquete no está disponible para esta clase");
    }
  }

  return { studio, schedule, celular, member, usable, needsPackage };
}

function packageOptions(options: Awaited<ReturnType<typeof findSellablePackages>>, studio: PublishedStudio) {
  return {
    estado: "NECESITA_PAQUETE" as const,
    // Spec 021 D3/R7: si el estudio valida antes de reservar, el plan se compra aparte.
    exigePagoValidado: studio.exigirPagoValidado,
    permitePagoEnEstudio: studio.permitirPagoEnEstudio,
    opciones: options.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      clases: item.clases,
      precio: Number(item.precio),
      discipline: { nombre: item.discipline.nombre, color: item.discipline.color }
    }))
  };
}

/** Cliente nuevo (o eliminado que vuelve): se crea o se restaura con lo que escribio. */
export async function ensurePublicMember(
  studioId: string,
  celular: string,
  input: { nombre?: string; apellido?: string | null },
  member: PublicMember | null
) {
  if (member && !member.deletedAt) return member;
  const data = { nombre: (input.nombre ?? "").trim(), apellido: input.apellido?.trim() || null };
  try {
    return await prisma.studioMember.upsert({
      where: { clientId_celular: { clientId: studioId, celular } },
      update: { ...data, deletedAt: null },
      create: { ...data, clientId: studioId, celular },
      select: { id: true, nombre: true, deletedAt: true }
    });
  } catch (error) {
    // Dos reservas web casi a la vez de alguien nuevo: la otra ya creo la ficha.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    return prisma.studioMember.findUniqueOrThrow({
      where: { clientId_celular: { clientId: studioId, celular } },
      select: { id: true, nombre: true, deletedAt: true }
    });
  }
}

export { newAccessToken };

/** Lo que la clienta ve de su plan al reservar (spec 021 R5). */
async function planSummary(saleId: string) {
  const sale = await prisma.memberPackage.findUniqueOrThrow({
    where: { id: saleId },
    select: {
      nombre: true,
      clases: true,
      clasesUsadas: true,
      precio: true,
      pagado: true,
      vence: true,
      origen: true,
      accessToken: true,
      discipline: { select: { nombre: true } },
      receipts: { select: { estado: true, createdAt: true } }
    }
  });
  const saldo = Math.max(Number(sale.precio) - Number(sale.pagado), 0);
  return {
    nombre: sale.nombre,
    discipline: sale.discipline.nombre,
    clases: sale.clases,
    clasesRestantes: sale.clases - sale.clasesUsadas,
    vence: dateToDateKey(sale.vence),
    saldo,
    situacionPago: paymentState({ saldo, origen: sale.origen, receipts: sale.receipts }),
    miPlan: sale.accessToken
  };
}

/** Spec 009 R1, con la vista previa y el pago de la spec 021. */
export async function createPublicBooking(slug: string, input: PublicBookingInput, instant = new Date()) {
  const { studio, celular, usable, needsPackage, ...prepared } = await preparePublicRequest(slug, input, instant);
  if (needsPackage) return needsPackage;

  // R5: lo que pasaria, sin reservar.
  if (input.vistaPrevia) {
    return { estado: "VISTA_PREVIA" as const, plan: usable.length ? await planSummary(usable[0].id) : null };
  }

  let venta: { packageId: string; origen: "PUBLICO"; accessToken: string } | undefined;
  let payment: OnlinePayment | null = null;
  if (!usable.length) {
    // R7: con "Esperar a validar el pago", el plan se compra aparte.
    if (studio.exigirPagoValidado) throw new ApiError(409, "Este estudio valida el pago antes de reservar: compra tu plan primero.");
    assertPaymentAllowed(studio, input.pago);
    payment = input.pago;
    await assertPendingPurchasesLimit(studio.id, prepared.member && !prepared.member.deletedAt ? prepared.member.id : null);
    venta = { packageId: input.packageId!, origen: "PUBLICO", accessToken: newAccessToken() };
  }

  const member = await ensurePublicMember(studio.id, celular, input, prepared.member);
  const accessToken = newAccessToken();
  const run = (media: MediaInput | null) =>
    createBooking({
      clientId: studio.id,
      scheduleId: input.scheduleId,
      fecha: input.fecha,
      memberId: member.id,
      memberPackageId: input.planToken ? usable[0].id : undefined,
      origen: "PUBLICO",
      accessToken,
      // Con plan vigente se descuenta de el; si no, se vende con su pago (spec 021 R6).
      ...(venta
        ? { venta: { ...venta, receipt: media && payment?.tipo === "COMPROBANTE" ? { media, metodo: payment.metodo } : undefined } }
        : {})
    });
  const booking = payment ? await withReceiptUpload(studio.id, payment, run) : await run(null);

  // Spec 011 R1: push a la duena (best-effort, no frena la respuesta si falla).
  await notifyPublicBooking(booking.id);
  const paquete = await planSummary(booking.memberPackageId);
  if (venta && payment) {
    await notifyOnlinePurchase({
      clientId: studio.id,
      memberId: member.id,
      memberName: member.nombre,
      saleId: booking.memberPackageId,
      plan: paquete.nombre,
      precio: paquete.saldo,
      withReceipt: payment.tipo === "COMPROBANTE"
    });
  }

  return { estado: "RESERVADA" as const, accessToken, paquete };
}

/** La reserva detras de un enlace privado, con lo justo para mostrarla. */
export async function getPublicBooking(token: string) {
  const booking = await prisma.booking.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      estado: true,
      claseDevuelta: true,
      member: { select: { nombre: true } },
      memberPackage: {
        select: {
          nombre: true,
          precio: true,
          pagado: true,
          anuladoAt: true,
          receipts: { select: { estado: true, motivoRechazo: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 }
        }
      },
      session: {
        select: {
          fecha: true,
          horaInicio: true,
          duracionMin: true,
          cancelada: true,
          schedule: { select: { instructor: true, discipline: { select: { nombre: true, color: true } } } },
          // Spec 023 R5: si hay reemplazo, se muestra quien la dicta.
          reemplazo: { select: { nombre: true, apellido: true } }
        }
      },
      client: { select: { businessName: true, slug: true, telefono: true, horasCancelacion: true } }
    }
  });
  if (!booking) return null;

  const saldo = booking.memberPackage.anuladoAt
    ? 0
    : Math.max(Number(booking.memberPackage.precio) - Number(booking.memberPackage.pagado), 0);

  return {
    id: booking.id,
    estado: booking.estado,
    claseDevuelta: booking.claseDevuelta,
    nombre: booking.member.nombre,
    paquete: booking.memberPackage.nombre,
    saldo,
    comprobantes: booking.memberPackage.receipts.map((receipt) => ({
      estado: receipt.estado,
      motivoRechazo: receipt.motivoRechazo,
      createdAt: receipt.createdAt.toISOString()
    })),
    clase: {
      fecha: booking.session.fecha.toISOString().slice(0, 10),
      horaInicio: booking.session.horaInicio,
      duracionMin: booking.session.duracionMin,
      cancelada: booking.session.cancelada,
      instructor: booking.session.reemplazo ? instructorName(booking.session.reemplazo) : booking.session.schedule.instructor,
      discipline: booking.session.schedule.discipline
    },
    estudio: booking.client
  };
}
