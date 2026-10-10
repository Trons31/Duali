import { randomBytes } from "node:crypto";
import { deleteFromCloudinary, uploadImageFromServer, type MediaInput } from "@/lib/cloudinary";
import { ApiError } from "@/lib/http";
import { classUsage, memberPackageStatus, sellMemberPackage } from "@/lib/member-packages";
import { queueNotification } from "@/lib/notification-queue";
import {
  type OnlinePayment,
  MAX_PENDING_ONLINE_PURCHASES,
  PAYMENT_STATE_LABELS,
  paymentState,
  receiptDataUrlProblem
} from "@/lib/online-payments";
import { prisma } from "@/lib/prisma";
import type { ExtendedTransactionClient } from "@/lib/prisma-types";
import { MAX_PENDING_RECEIPTS } from "@/lib/receipts";
import { namesMatch, normalizeMemberPhone } from "@/lib/studio-constants";
import { money } from "@/lib/studio-messages";
import { dateToDateKey, studioNow } from "@/lib/studio-time";

// Comprar un plan desde la pagina publica y "Mi plan" (spec 021).

export type { OnlinePayment };

type StudioForPayments = {
  id: string;
  permitirPagoEnEstudio: boolean;
  paymentMethods: Array<{ name: string; account: string }>;
};

export function newAccessToken() {
  return randomBytes(24).toString("base64url");
}

/**
 * Spec 009 (seguridad sin contrasena): si el celular ya es de una clienta, el
 * nombre debe coincidir. No escribe nada.
 */
export async function identifyPublicMember(studioId: string, celularInput: string, nombre: string) {
  const celular = normalizeMemberPhone(celularInput);
  const member = await prisma.studioMember.findUnique({
    where: { clientId_celular: { clientId: studioId, celular } },
    select: { id: true, nombre: true, deletedAt: true }
  });
  if (member && !member.deletedAt && !namesMatch(member.nombre, nombre)) {
    throw new ApiError(409, "Ese celular está registrado con otro nombre. Escríbele al estudio.");
  }
  return { celular, member };
}

/** Spec 021 D2 y R2: con comprobante, o en el estudio si este lo permite. */
export function assertPaymentAllowed(studio: StudioForPayments, payment: OnlinePayment | undefined): asserts payment is OnlinePayment {
  if (!payment) {
    throw new ApiError(422, studio.permitirPagoEnEstudio ? "Elige cómo vas a pagar" : "Adjunta el comprobante de pago para continuar");
  }
  if (payment.tipo === "EN_ESTUDIO") {
    if (!studio.permitirPagoEnEstudio) throw new ApiError(422, "Este estudio pide el comprobante para comprar en línea");
    return;
  }
  if (!studio.paymentMethods.length) throw new ApiError(422, "Este estudio aún no recibe pagos en línea. Escríbele al estudio.");
  if (!studio.paymentMethods.some((method) => method.name === payment.metodo)) {
    throw new ApiError(422, "Elige uno de los métodos de pago del estudio");
  }
  const problem = receiptDataUrlProblem(payment.comprobante);
  if (problem) throw new ApiError(422, problem);
}

/** Spec 021 D7: compras en linea que siguen sin pagar del todo. */
export async function assertPendingPurchasesLimit(clientId: string, memberId: string | null | undefined) {
  if (!memberId) return;
  const sales = await prisma.memberPackage.findMany({
    where: { clientId, memberId, origen: "PUBLICO", anuladoAt: null },
    select: { precio: true, pagado: true }
  });
  const pending = sales.filter((sale) => Number(sale.pagado) < Number(sale.precio)).length;
  if (pending >= MAX_PENDING_ONLINE_PURCHASES) {
    throw new ApiError(409, "Ya tienes compras esperando que el estudio valide el pago. Escríbele al estudio.");
  }
}

/**
 * Sube la foto (si hay) y corre `work`; si `work` falla, la foto se borra. Asi
 * una compra que no se completa no deja archivos en Cloudinary.
 */
export async function withReceiptUpload<T>(
  clientId: string,
  payment: OnlinePayment,
  work: (media: MediaInput | null) => Promise<T>
): Promise<T> {
  const media = payment.tipo === "COMPROBANTE" ? await uploadImageFromServer(clientId, "comprobantes", payment.comprobante) : null;
  try {
    return await work(media);
  } catch (error) {
    if (media) await deleteFromCloudinary(media.publicId, "IMAGEN");
    throw error;
  }
}

export async function createReceiptRow(
  tx: ExtendedTransactionClient,
  input: { clientId: string; memberPackageId: string; bookingId?: string | null; media: MediaInput; metodo: string }
) {
  return tx.paymentReceipt.create({
    data: {
      clientId: input.clientId,
      memberPackageId: input.memberPackageId,
      bookingId: input.bookingId ?? null,
      url: input.media.url,
      publicId: input.media.publicId,
      metodoPago: input.metodo
    },
    select: { id: true }
  });
}

/** Spec 021 R13: best-effort, no frena la compra si falla. */
export async function notifyOnlinePurchase(input: {
  clientId: string;
  memberId: string;
  memberName: string;
  saleId: string;
  plan: string;
  precio: number;
  withReceipt: boolean;
}) {
  try {
    await queueNotification({
      clientId: input.clientId,
      type: "STUDIO_PLAN_PURCHASE",
      dedupKey: `studio-plan:${input.saleId}`,
      title: `${input.memberName} compró ${input.plan}`,
      body: input.withReceipt ? `Envió su comprobante de ${money(input.precio)}: revísalo` : `Pagará ${money(input.precio)} en el estudio`,
      data: { type: "STUDIO_PLAN_PURCHASE", href: `/dashboard/clientes/${input.memberId}`, saleId: input.saleId }
    });
  } catch (error) {
    console.error("No se pudo avisar la compra en línea", error);
  }
}

type PurchaseInput = {
  packageId: string;
  celular: string;
  nombre: string;
  apellido?: string | null;
  pago?: OnlinePayment;
};

/** Spec 021 R3: vende el plan, guarda el comprobante y crea el enlace Mi plan, todo junto. */
export async function createOnlinePlanPurchase(
  studio: StudioForPayments,
  input: PurchaseInput,
  ensureMember: (celular: string, member: { id: string; nombre: string; deletedAt: Date | null } | null) => Promise<{ id: string; nombre: string }>
) {
  const item = await prisma.package.findFirst({
    where: { id: input.packageId, clientId: studio.id, deletedAt: null, activo: true, visiblePublico: true, discipline: { deletedAt: null, activa: true } },
    select: { id: true, nombre: true, precio: true }
  });
  if (!item) throw new ApiError(404, "Ese plan no está disponible en línea");

  assertPaymentAllowed(studio, input.pago);
  const payment = input.pago;
  const identity = await identifyPublicMember(studio.id, input.celular, input.nombre);
  await assertPendingPurchasesLimit(studio.id, identity.member && !identity.member.deletedAt ? identity.member.id : null);
  const member = await ensureMember(identity.celular, identity.member);
  const accessToken = newAccessToken();

  const sale = await withReceiptUpload(studio.id, payment, (media) =>
    prisma.$transaction(async (tx) => {
      // D6: empieza el dia de la compra.
      const created = await sellMemberPackage(tx, {
        clientId: studio.id,
        memberId: member.id,
        packageId: item.id,
        inicio: studioNow().dateKey,
        origen: "PUBLICO",
        accessToken
      });
      if (media && payment.tipo === "COMPROBANTE") {
        await createReceiptRow(tx, { clientId: studio.id, memberPackageId: created.id, media, metodo: payment.metodo });
      }
      return created;
    })
  );

  await notifyOnlinePurchase({
    clientId: studio.id,
    memberId: member.id,
    memberName: member.nombre,
    saleId: sale.id,
    plan: item.nombre,
    precio: Number(item.precio),
    withReceipt: payment.tipo === "COMPROBANTE"
  });

  return { accessToken, plan: await getPublicPlan(accessToken) };
}

const publicPlanSelect = {
  id: true,
  nombre: true,
  clases: true,
  clasesUsadas: true,
  precio: true,
  pagado: true,
  inicio: true,
  vence: true,
  anuladoAt: true,
  origen: true,
  disciplineId: true,
  discipline: {
    select: { nombre: true, color: true, tipo: true, comboItems: { select: { disciplineId: true, discipline: { select: { nombre: true } } } } }
  },
  member: { select: { id: true, nombre: true } },
  receipts: { select: { estado: true, motivoRechazo: true, metodoPago: true, createdAt: true }, orderBy: { createdAt: "desc" as const } },
  payments: { where: { anuladoAt: null }, select: { monto: true, metodoPago: true, fecha: true }, orderBy: { fecha: "desc" as const } },
  bookings: {
    select: {
      estado: true,
      claseDevuelta: true,
      accessToken: true,
      session: {
        select: { fecha: true, horaInicio: true, schedule: { select: { discipline: { select: { nombre: true, color: true } } } } }
      }
    },
    orderBy: [{ session: { fecha: "asc" as const } }, { session: { horaInicio: "asc" as const } }]
  },
  client: {
    select: { id: true, businessName: true, slug: true, telefono: true, exigirPagoValidado: true, paymentMethodItems: true }
  }
};

/** Disciplinas donde sirve un plan: la suya o las que incluye su combo. */
export function planDisciplineIds(plan: { disciplineId: string; discipline: { tipo: string; comboItems: Array<{ disciplineId: string }> } }) {
  return plan.discipline.tipo === "COMBO" ? plan.discipline.comboItems.map((item) => item.disciplineId) : [plan.disciplineId];
}

/** Spec 021 R8: el plan detras de un enlace privado, con lo justo para mostrarlo. */
export async function getPublicPlan(token: string, instant = new Date()) {
  const row = await prisma.memberPackage.findUnique({ where: { accessToken: token }, select: publicPlanSelect });
  if (!row) return null;

  const today = studioNow(instant).dateKey;
  const precio = Number(row.precio);
  const pagado = Number(row.pagado);
  const saldo = row.anuladoAt ? 0 : Math.max(precio - pagado, 0);
  const estado = memberPackageStatus(row, today);
  const situacionPago = row.anuladoAt ? "PAGADO" : paymentState({ saldo, origen: row.origen, receipts: row.receipts });
  const bookings = row.bookings.map((booking) => ({
    estado: booking.estado,
    claseDevuelta: booking.claseDevuelta,
    // Solo las reservas web tienen su propio enlace para gestionarlas.
    enlace: booking.accessToken,
    fecha: dateToDateKey(booking.session.fecha),
    horaInicio: booking.session.horaInicio,
    discipline: booking.session.schedule.discipline
  }));

  const canBook = estado === "ACTIVO" && !(row.client.exigirPagoValidado && saldo > 0);

  return {
    id: row.id,
    nombre: row.nombre,
    discipline: { nombre: row.discipline.nombre, color: row.discipline.color },
    incluye: row.discipline.tipo === "COMBO" ? row.discipline.comboItems.map((item) => item.discipline.nombre) : [],
    disciplineIds: planDisciplineIds(row),
    clases: row.clases,
    clasesRestantes: Math.max(row.clases - row.clasesUsadas, 0),
    uso: classUsage(row.bookings),
    inicio: dateToDateKey(row.inicio),
    vence: dateToDateKey(row.vence),
    estado,
    precio,
    pagado,
    saldo,
    situacionPago,
    situacionPagoTexto: PAYMENT_STATE_LABELS[situacionPago],
    puedeReservar: canBook,
    motivoNoReserva:
      estado === "ANULADO"
        ? "Este plan fue anulado. Escríbele al estudio."
        : estado === "VENCIDO"
          ? "Este plan ya venció."
          : estado === "AGOTADO"
            ? "Ya usaste todas las clases de este plan."
            : !canBook
              ? "Tu pago está en revisión. Podrás reservar cuando el estudio lo valide."
              : null,
    puedeEnviarComprobante: saldo > 0 && !row.anuladoAt && row.receipts.filter((item) => item.estado === "POR_REVISAR").length < MAX_PENDING_RECEIPTS,
    comprobantes: row.receipts.map((receipt) => ({
      estado: receipt.estado,
      motivoRechazo: receipt.motivoRechazo,
      metodoPago: receipt.metodoPago,
      createdAt: receipt.createdAt.toISOString()
    })),
    pagos: row.payments.map((payment) => ({ monto: Number(payment.monto), metodoPago: payment.metodoPago, fecha: payment.fecha.toISOString() })),
    proximas: bookings.filter((booking) => booking.estado === "RESERVADA" && booking.fecha >= today),
    historial: bookings.filter((booking) => !(booking.estado === "RESERVADA" && booking.fecha >= today)).reverse(),
    nombreCliente: row.member.nombre,
    estudio: {
      businessName: row.client.businessName,
      slug: row.client.slug,
      telefono: row.client.telefono,
      paymentMethods: Array.isArray(row.client.paymentMethodItems)
        ? (row.client.paymentMethodItems as Array<{ name?: unknown; account?: unknown }>)
            .map((method) => ({ name: String(method?.name ?? "").trim(), account: String(method?.account ?? "").trim() }))
            .filter((method) => method.name || method.account)
        : []
    }
  };
}

export type PublicPlan = NonNullable<Awaited<ReturnType<typeof getPublicPlan>>>;

/** Spec 021 R8: otro comprobante desde Mi plan (rechazado o pago en el estudio). */
export async function attachPlanReceipt(token: string, input: { comprobante: string; metodo: string }) {
  const sale = await prisma.memberPackage.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      clientId: true,
      nombre: true,
      precio: true,
      pagado: true,
      anuladoAt: true,
      member: { select: { id: true, nombre: true } },
      client: { select: { paymentMethodItems: true, permitirPagoEnEstudio: true } }
    }
  });
  if (!sale) throw new ApiError(404, "Plan no encontrado");
  const saldo = Number(sale.precio) - Number(sale.pagado);
  if (sale.anuladoAt || saldo <= 0) throw new ApiError(409, "Este plan no tiene saldo por pagar");
  const studio: StudioForPayments = {
    id: sale.clientId,
    permitirPagoEnEstudio: sale.client.permitirPagoEnEstudio,
    paymentMethods: Array.isArray(sale.client.paymentMethodItems)
      ? (sale.client.paymentMethodItems as Array<{ name?: unknown; account?: unknown }>).map((method) => ({
          name: String(method?.name ?? "").trim(),
          account: String(method?.account ?? "").trim()
        }))
      : []
  };
  const payment: OnlinePayment = { tipo: "COMPROBANTE", comprobante: input.comprobante, metodo: input.metodo };
  assertPaymentAllowed(studio, payment);

  const pending = await prisma.paymentReceipt.count({ where: { memberPackageId: sale.id, estado: "POR_REVISAR" } });
  if (pending >= MAX_PENDING_RECEIPTS) throw new ApiError(429, "Ya enviaste varios comprobantes; el estudio los está revisando");

  await withReceiptUpload(studio.id, payment, (media) =>
    prisma.$transaction((tx) => createReceiptRow(tx, { clientId: studio.id, memberPackageId: sale.id, media: media!, metodo: input.metodo }))
  );
  try {
    await queueNotification({
      clientId: studio.id,
      type: "STUDIO_RECEIPT",
      dedupKey: `studio-receipt:${sale.id}:${Date.now()}`,
      title: `${sale.member.nombre} envió un comprobante`,
      body: `${sale.nombre} · saldo por revisar: ${money(saldo)}`,
      data: { type: "STUDIO_RECEIPT", href: `/dashboard/clientes/${sale.member.id}` }
    });
  } catch (error) {
    console.error("No se pudo avisar el comprobante", error);
  }
  return getPublicPlan(token);
}

/** Spec 021 R10: el enlace Mi plan de cualquier venta del negocio (lo crea si falta). */
export async function ensurePlanAccessToken(clientId: string, saleId: string) {
  const sale = await prisma.memberPackage.findFirst({ where: { id: saleId, clientId }, select: { id: true, accessToken: true, anuladoAt: true } });
  if (!sale) throw new ApiError(404, "Venta no encontrada");
  if (sale.anuladoAt) throw new ApiError(409, "La venta está anulada");
  if (sale.accessToken) return sale.accessToken;
  const token = newAccessToken();
  // Condicionado: si dos pedidos llegan a la vez, ambos terminan con el mismo enlace.
  await prisma.memberPackage.updateMany({ where: { id: sale.id, accessToken: null }, data: { accessToken: token } });
  const saved = await prisma.memberPackage.findUniqueOrThrow({ where: { id: sale.id }, select: { accessToken: true } });
  return saved.accessToken!;
}
