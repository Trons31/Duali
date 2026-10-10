import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/http";
import { paymentState } from "@/lib/online-payments";
import type { ExtendedTransactionClient } from "@/lib/prisma-types";
import { addDaysToKey, dateKeyToDate, dateToDateKey, daysBetweenKeys } from "@/lib/studio-time";

// Ventas del estudio (spec 006). El estado se calcula al leer: asi un paquete
// vence o se agota sin ningun proceso nocturno.

export type MemberPackageStatus = "ACTIVO" | "AGOTADO" | "VENCIDO" | "ANULADO";
export type MemberPackagePaymentStatus = "PAGADO" | "PARCIAL" | "PENDIENTE";

export const EXPIRING_SOON_DAYS = 3;
export const FEW_CLASSES_LEFT = 2;
/** Spec 020 D2: plazo para pagar el saldo cuando el estudio no lo cambia. */
export const DEFAULT_BALANCE_DAYS = 7;
/** Spec 020 R7: hasta cuando un plan vencido sigue siendo "por renovar". */
export const RENEWAL_WINDOW_DAYS = 60;

export { normalizeMemberPhone } from "@/lib/studio-constants";

export const memberPackageInclude = {
  discipline: { select: { id: true, nombre: true, color: true, tipo: true } },
  payments: { orderBy: { fecha: "desc" } },
  // Spec 019 R8: para desglosar las clases usadas (asistio, falto, reservadas).
  bookings: {
    select: {
      estado: true,
      claseDevuelta: true,
      session: { select: { fecha: true, horaInicio: true, schedule: { select: { discipline: { select: { nombre: true } } } } } }
    },
    orderBy: [{ session: { fecha: "asc" } }, { session: { horaInicio: "asc" } }]
  },
  // Spec 021: estado del pago (en revision, rechazado).
  receipts: { select: { estado: true, createdAt: true } },
  // Spec 020: plazo del saldo y renovaciones.
  client: { select: { diasPlazoSaldo: true } },
  renovacionDe: { select: { id: true, nombre: true, inicio: true, vence: true } },
  renovaciones: { where: { anuladoAt: null }, select: { id: true, nombre: true, inicio: true, vence: true }, orderBy: { createdAt: "desc" }, take: 1 }
} satisfies Prisma.MemberPackageInclude;

type MemberPackageRow = Prisma.MemberPackageGetPayload<{ include: typeof memberPackageInclude }>;

export function memberPackageStatus(
  row: Pick<MemberPackageRow, "anuladoAt" | "vence" | "clases" | "clasesUsadas">,
  today: string
): MemberPackageStatus {
  if (row.anuladoAt) return "ANULADO";
  if (dateToDateKey(row.vence) < today) return "VENCIDO";
  if (row.clasesUsadas >= row.clases) return "AGOTADO";
  return "ACTIVO";
}

type UsageBooking = { estado: string; claseDevuelta: boolean };

/**
 * Spec 019 R8: en que se fueron las clases usadas. Las devueltas no cuentan.
 * "Falto" incluye las cancelaciones fuera de plazo (la clase se perdio igual).
 */
export function classUsage(bookings: UsageBooking[]) {
  const counted = bookings.filter((booking) => !booking.claseDevuelta);
  return {
    asistio: counted.filter((booking) => booking.estado === "ASISTIO").length,
    falto: counted.filter((booking) => booking.estado === "NO_ASISTIO" || booking.estado === "CANCELADA").length,
    reservadas: counted.filter((booking) => booking.estado === "RESERVADA").length
  };
}

/** Spec 020 D2: "paga el resto antes del..."; sin fecha guardada, inicio + plazo. */
export function paymentDeadline(sale: { fechaLimitePago: Date | null; inicio: Date }, diasPlazoSaldo: number) {
  return sale.fechaLimitePago ? dateToDateKey(sale.fechaLimitePago) : addDaysToKey(dateToDateKey(sale.inicio), diasPlazoSaldo);
}

/**
 * Spec 020 D1: un plan vigente (con clases) se renueva desde el dia siguiente a
 * su vencimiento, para no perder dias; uno vencido o agotado, desde hoy.
 */
export function renewalStart(sale: { estado: MemberPackageStatus; vence: string }, today: string) {
  return sale.estado === "ACTIVO" && sale.vence >= today ? addDaysToKey(sale.vence, 1) : today;
}

function renewalLink(row: { id: string; nombre: string; inicio: Date; vence: Date } | null | undefined) {
  return row ? { id: row.id, nombre: row.nombre, inicio: dateToDateKey(row.inicio), vence: dateToDateKey(row.vence) } : null;
}

/** Spec 019 D2: una venta de 1 clase es una clase suelta; con mas, un plan. */
export function isDropIn(item: { clases: number }) {
  return item.clases === 1;
}

export function serializeMemberPackage(row: MemberPackageRow, today: string) {
  const precio = Number(row.precio);
  const pagado = Number(row.pagado);
  const saldo = row.anuladoAt ? 0 : Math.max(precio - pagado, 0);
  const vence = dateToDateKey(row.vence);
  const estado = memberPackageStatus(row, today);
  const clasesRestantes = Math.max(row.clases - row.clasesUsadas, 0);
  const diasParaVencer = daysBetweenKeys(today, vence);
  const situacionPago = row.anuladoAt ? ("PAGADO" as const) : paymentState({ saldo, origen: row.origen, receipts: row.receipts });
  // Spec 020 R2/R12: un pago en revision no esta atrasado (ya pago; falta validar).
  const fechaLimitePago = paymentDeadline(row, row.client.diasPlazoSaldo);
  const saldoVencido = saldo > 0 && situacionPago !== "EN_REVISION" && fechaLimitePago < today;
  const renovadoPor = renewalLink(row.renovaciones[0]);
  const porVencer = estado === "ACTIVO" && diasParaVencer <= EXPIRING_SOON_DAYS;
  const claseSuelta = isDropIn(row);

  return {
    id: row.id,
    memberId: row.memberId,
    packageId: row.packageId,
    nombre: row.nombre,
    discipline: row.discipline,
    clases: row.clases,
    clasesUsadas: row.clasesUsadas,
    clasesRestantes,
    precio,
    pagado,
    saldo,
    estadoPago: (pagado >= precio ? "PAGADO" : pagado > 0 ? "PARCIAL" : "PENDIENTE") as MemberPackagePaymentStatus,
    inicio: dateToDateKey(row.inicio),
    vence,
    estado,
    porVencer,
    pocasClases: estado === "ACTIVO" && row.clases > 1 && clasesRestantes <= FEW_CLASSES_LEFT,
    diasParaVencer,
    uso: classUsage(row.bookings),
    claseSuelta,
    // La clase para la que se uso (o se aparto) una clase suelta.
    clase: (() => {
      const booking = row.bookings.find((item) => !item.claseDevuelta);
      return booking
        ? {
            fecha: dateToDateKey(booking.session.fecha),
            horaInicio: booking.session.horaInicio,
            disciplina: booking.session.schedule.discipline.nombre,
            estado: booking.estado
          }
        : null;
    })(),
    anuladoAt: row.anuladoAt?.toISOString() ?? null,
    motivoAnulacion: row.motivoAnulacion,
    notas: row.notas,
    // Spec 021 R12.
    origen: row.origen,
    situacionPago,
    // Spec 020 R1/R2.
    fechaLimitePago,
    saldoVencido,
    diasAtrasoSaldo: saldoVencido ? daysBetweenKeys(fechaLimitePago, today) : 0,
    diasVencido: estado === "VENCIDO" ? daysBetweenKeys(vence, today) : 0,
    renovadoPor,
    renovacionDe: renewalLink(row.renovacionDe),
    // Spec 020 R3: por vencer, vencido o agotado, y sin renovar.
    puedeRenovar: !claseSuelta && !renovadoPor && (porVencer || estado === "VENCIDO" || estado === "AGOTADO"),
    createdAt: row.createdAt.toISOString(),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      monto: Number(payment.monto),
      metodoPago: payment.metodoPago,
      fecha: payment.fecha.toISOString(),
      notas: payment.notas,
      anuladoAt: payment.anuladoAt?.toISOString() ?? null
    }))
  };
}

export type MemberPackageView = ReturnType<typeof serializeMemberPackage>;

type ExpiryView = Pick<
  MemberPackageView,
  "id" | "memberId" | "estado" | "claseSuelta" | "renovadoPor" | "diasVencido" | "vence" | "discipline"
>;

/**
 * Spec 020 R7: planes vencidos hace RENEWAL_WINDOW_DAYS dias o menos, sin
 * renovar, de clientes que no tienen otro plan vigente. Uno por cliente y
 * disciplina (el mas reciente), del que vencio hace menos al que mas.
 */
export function expiredWithoutRenewal<T extends ExpiryView>(views: T[], windowDays = RENEWAL_WINDOW_DAYS): T[] {
  const withActivePlan = new Set(views.filter((view) => view.estado === "ACTIVO" && !view.claseSuelta).map((view) => view.memberId));
  const latest = new Map<string, T>();
  for (const view of views) {
    if (view.estado !== "VENCIDO" || view.claseSuelta || view.renovadoPor || view.diasVencido > windowDays) continue;
    if (withActivePlan.has(view.memberId)) continue;
    const key = `${view.memberId}|${view.discipline.id}`;
    const current = latest.get(key);
    if (!current || view.vence > current.vence) latest.set(key, view);
  }
  return Array.from(latest.values()).sort((a, b) => a.diasVencido - b.diasVencido);
}

/** Los paquetes que todavia importan en la operacion: vigentes o con saldo. */
export function isCurrentPackage(item: MemberPackageView) {
  return item.estado === "ACTIVO" || item.saldo > 0;
}

export const studioMemberInclude = {
  packages: { include: memberPackageInclude, orderBy: [{ vence: "desc" }, { createdAt: "desc" }] }
} satisfies Prisma.StudioMemberInclude;

type StudioMemberRow = Prisma.StudioMemberGetPayload<{ include: typeof studioMemberInclude }>;

export function serializeStudioMember(row: StudioMemberRow, today: string) {
  const packages = row.packages.map((item) => serializeMemberPackage(item, today));

  return {
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    celular: row.celular,
    email: row.email,
    fechaNacimiento: row.fechaNacimiento ? dateToDateKey(row.fechaNacimiento) : null,
    notas: row.notas,
    studentId: row.studentId,
    createdAt: row.createdAt.toISOString(),
    saldo: packages.reduce((sum, item) => sum + item.saldo, 0),
    vigentes: packages.filter((item) => item.estado === "ACTIVO"),
    // Spec 019 R4: lo que la duena pregunta primero de cada cliente.
    clasesDisponibles: packages.filter((item) => item.estado === "ACTIVO").reduce((sum, item) => sum + item.clasesRestantes, 0),
    proxima: nextBooking(row.packages, today),
    packages
  };
}

export type StudioMemberView = ReturnType<typeof serializeStudioMember>;

/** La proxima clase reservada (hoy o despues) entre todas sus ventas. */
function nextBooking(packages: MemberPackageRow[], today: string) {
  const upcoming = packages
    .flatMap((item) => item.bookings)
    .filter((booking) => booking.estado === "RESERVADA" && dateToDateKey(booking.session.fecha) >= today)
    .map((booking) => ({
      fecha: dateToDateKey(booking.session.fecha),
      horaInicio: booking.session.horaInicio,
      disciplina: booking.session.schedule.discipline.nombre
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio));
  return upcoming[0] ?? null;
}

type SaleInput = {
  clientId: string;
  memberId: string;
  packageId: string;
  inicio: string;
  precio?: number;
  notas?: string | null;
  pago?: { monto: number; metodoPago: string };
  /** Spec 021: compra desde la pagina publica, con su enlace "Mi plan". */
  origen?: "PANEL" | "PUBLICO";
  accessToken?: string;
  /** Spec 020 D2: nula = la regla del plazo del estudio. */
  fechaLimitePago?: string | null;
  /** Spec 020 D1: la venta que esta renueva. */
  renovacionDeId?: string | null;
};

/**
 * Venta de un paquete (spec 006 R2). Vive aqui para que la reserva con clase
 * suelta (spec 007) venda exactamente igual, dentro de su propia transaccion.
 */
export async function sellMemberPackage(tx: ExtendedTransactionClient, input: SaleInput) {
  const [member, item] = await Promise.all([
    tx.studioMember.findFirst({ where: { id: input.memberId, clientId: input.clientId, deletedAt: null }, select: { id: true } }),
    tx.package.findFirst({ where: { id: input.packageId, clientId: input.clientId, deletedAt: null, activo: true } })
  ]);
  if (!member) throw new ApiError(404, "Cliente no encontrado");
  if (!item) throw new ApiError(422, "El paquete no existe o no está disponible para la venta");

  const precio = input.precio ?? Number(item.precio);
  if (input.pago && input.pago.monto > precio) throw new ApiError(422, "El pago no puede superar el precio del paquete");
  if (input.fechaLimitePago && input.fechaLimitePago < input.inicio) {
    throw new ApiError(422, "La fecha para pagar el saldo no puede ser antes del inicio");
  }
  // Si queda pagado, la fecha limite no aplica.
  const fechaLimitePago = input.pago && input.pago.monto >= precio ? null : input.fechaLimitePago;

  const sale = await tx.memberPackage.create({
    data: {
      clientId: input.clientId,
      memberId: member.id,
      packageId: item.id,
      disciplineId: item.disciplineId,
      nombre: item.nombre,
      clases: item.clases,
      precio,
      pagado: input.pago?.monto ?? 0,
      inicio: dateKeyToDate(input.inicio),
      vence: dateKeyToDate(addDaysToKey(input.inicio, item.vigenciaDias - 1)),
      notas: input.notas ?? null,
      origen: input.origen ?? "PANEL",
      accessToken: input.accessToken ?? null,
      fechaLimitePago: fechaLimitePago ? dateKeyToDate(fechaLimitePago) : null,
      renovacionDeId: input.renovacionDeId ?? null
    }
  });

  if (input.pago) {
    await tx.memberPackagePayment.create({
      data: {
        clientId: input.clientId,
        memberPackageId: sale.id,
        monto: input.pago.monto,
        metodoPago: input.pago.metodoPago,
        fecha: new Date()
      }
    });
  }

  return sale;
}

type RenewInput = Omit<SaleInput, "memberId" | "packageId" | "inicio" | "renovacionDeId"> & { saleId: string; today: string; inicio?: string };

/**
 * Spec 020 D1/R3: renovar es vender el mismo paquete otra vez, encadenado a la
 * venta anterior. La fila anterior se bloquea para que dos pedidos a la vez no
 * creen dos renovaciones.
 */
export async function renewMemberPackage(tx: ExtendedTransactionClient, input: RenewInput) {
  await tx.$executeRaw(Prisma.sql`SELECT 1 FROM "member_packages" WHERE "id" = ${input.saleId} AND "clientId" = ${input.clientId} FOR UPDATE`);
  const previous = await tx.memberPackage.findFirst({
    where: { id: input.saleId, clientId: input.clientId },
    select: {
      id: true,
      memberId: true,
      packageId: true,
      clases: true,
      clasesUsadas: true,
      vence: true,
      anuladoAt: true,
      renovaciones: { where: { anuladoAt: null }, select: { id: true }, take: 1 }
    }
  });
  if (!previous) throw new ApiError(404, "Venta no encontrada");
  if (previous.anuladoAt) throw new ApiError(409, "La venta está anulada");
  if (isDropIn(previous)) throw new ApiError(422, "Las clases sueltas no se renuevan; vende otra");
  if (previous.renovaciones.length) throw new ApiError(409, "Este plan ya se renovó");

  const { saleId, today, ...sale } = input;
  const inicio = input.inicio ?? renewalStart({ estado: memberPackageStatus(previous, today), vence: dateToDateKey(previous.vence) }, today);
  return sellMemberPackage(tx, { ...sale, memberId: previous.memberId, packageId: previous.packageId, inicio, renovacionDeId: saleId });
}

/**
 * Registra un pago o abono de una venta (spec 006 R4). El tope se valida en el
 * mismo UPDATE: dos pagos simultaneos no pueden dejar la venta pagada de mas.
 * Lo usan el panel y la aprobacion de comprobantes (spec 014).
 */
export async function addPackagePayment(
  tx: ExtendedTransactionClient,
  input: { clientId: string; saleId: string; monto: number; metodoPago: string; fecha?: string; notas?: string | null }
) {
  const current = await tx.memberPackage.findFirst({ where: { id: input.saleId, clientId: input.clientId } });
  if (!current) throw new ApiError(404, "Venta no encontrada");
  if (current.anuladoAt) throw new ApiError(409, "La venta está anulada");

  const updatedRows = await tx.$executeRaw(Prisma.sql`
    UPDATE "member_packages"
    SET "pagado" = "pagado" + ${input.monto}, "updatedAt" = NOW()
    WHERE "id" = ${input.saleId} AND "anuladoAt" IS NULL AND "pagado" + ${input.monto} <= "precio"
  `);
  if (updatedRows === 0) {
    const saldo = Number(current.precio) - Number(current.pagado);
    throw new ApiError(422, `El pago supera el saldo pendiente ($${saldo.toLocaleString("es-CO")})`);
  }

  return tx.memberPackagePayment.create({
    data: {
      clientId: input.clientId,
      memberPackageId: input.saleId,
      monto: input.monto,
      metodoPago: input.metodoPago,
      // Una fecha elegida se guarda al mediodia de Bogota para que no se corra de dia.
      fecha: input.fecha ? new Date(`${input.fecha}T17:00:00.000Z`) : new Date(),
      notas: input.notas ?? null
    }
  });
}
