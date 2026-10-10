import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/http";
import { cycleLabel } from "@/lib/instructor-cycle-time";
import { ensureInstructorLedger, serializeCycleView, settlement, snapshotPay } from "@/lib/instructor-ledger";
import { describePay } from "@/lib/instructor-pay";
import { instructorName } from "@/lib/instructors";
import { prisma } from "@/lib/prisma";
import type { ExtendedTransactionClient } from "@/lib/prisma-types";
import { dateToDateKey, studioNow } from "@/lib/studio-time";
import type { InstructorPayInput } from "@/lib/validations";

// Pagos a instructores (spec 023 fase 3, D8): pagar total o parcial, saldo
// anterior primero, en una o dos formas, con su egreso; historial y anular.

const num = (value: Prisma.Decimal | number | null | undefined) => (value == null ? 0 : Number(value));

/** D8: el egreso de cada pago va a Nomina (sueldos) o Comision (variables). */
const EXPENSE_CATEGORY = { COMISION: "COMMISSION", SUELDO: "SALARY" } as const;
const TYPE_LABEL = { COMISION: "Comisiones", SUELDO: "Sueldo" } as const;

async function lockLedger(tx: ExtendedTransactionClient, clientId: string) {
  // El mismo candado del calculo: un pago no se cruza con un recalculo.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`instructor-ledger:${clientId}`}))`;
}

/**
 * R11. Reparte el monto entre los ciclos con saldo, del mas viejo al mas nuevo,
 * segun el alcance elegido. R16: nunca aplica mas de lo pendiente (se valida en
 * el mismo UPDATE).
 */
export async function payInstructor(clientId: string, input: InstructorPayInput, now = new Date()) {
  const today = studioNow(now).dateKey;
  if (!(await ensureInstructorLedger(clientId, now))) throw new ApiError(409, "Primero configura el ciclo de pago");

  const paymentId = await prisma.$transaction(async (tx) => {
    await lockLedger(tx, clientId);
    const instructor = await tx.instructor.findFirst({
      where: { id: input.instructorId, clientId, deletedAt: null },
      select: { id: true, nombre: true, apellido: true }
    });
    if (!instructor) throw new ApiError(404, "Instructor no encontrado");

    const cycles = await tx.instructorCycle.findMany({
      where: { instructorId: instructor.id, tipo: input.tipo, pendiente: { gt: 0 } },
      orderBy: { inicio: "asc" }
    });
    const isCurrent = (cycle: (typeof cycles)[number]) => dateToDateKey(cycle.inicio) <= today && today <= dateToDateKey(cycle.fin);
    const pool = cycles.filter((cycle) => (input.alcance === "TODO" ? true : input.alcance === "SALDO" ? !isCurrent(cycle) : isCurrent(cycle)));
    const max = Math.round(pool.reduce((sum, cycle) => sum + num(cycle.pendiente), 0));
    if (!max) throw new ApiError(409, input.alcance === "SALDO" ? "No tiene saldo anterior pendiente" : "No hay nada pendiente por pagar");
    if (input.monto > max) throw new ApiError(409, `El máximo para esta opción es $${max.toLocaleString("es-CO")}`);

    const applications: Array<{ cycleId: string; monto: number; etiqueta: string }> = [];
    let remaining = input.monto;
    for (const cycle of pool) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, num(cycle.pendiente));
      const updated = await tx.instructorCycle.updateMany({
        where: { id: cycle.id, pendiente: { gte: amount } },
        data: { pagado: { increment: amount }, pendiente: { decrement: amount } }
      });
      if (updated.count !== 1) throw new ApiError(409, "El saldo cambió mientras pagabas; vuelve a intentarlo");
      const pagado = num(cycle.pagado) + amount;
      await tx.instructorCycle.update({ where: { id: cycle.id }, data: { situacion: settlement(pagado, num(cycle.pendiente) - amount) } });
      applications.push({ cycleId: cycle.id, monto: amount, etiqueta: cycleLabel(dateToDateKey(cycle.inicio), dateToDateKey(cycle.fin)) });
      remaining -= amount;
    }

    const name = instructorName(instructor);
    const expense = await tx.expense.create({
      data: {
        clientId,
        concepto: `Pago a ${name}`,
        descripcion: [`${TYPE_LABEL[input.tipo]} · ciclo ${applications.map((item) => item.etiqueta).join(", ")}`, input.nota].filter(Boolean).join(" · "),
        monto: input.monto,
        fecha: now,
        categoria: EXPENSE_CATEGORY[input.tipo]
      }
    });
    const payment = await tx.instructorPayment.create({
      data: {
        clientId,
        instructorId: instructor.id,
        tipo: input.tipo,
        monto: input.monto,
        fecha: now,
        nota: input.nota ?? null,
        expenseId: expense.id,
        methods: { create: input.metodos.map((item) => ({ metodo: item.metodo, monto: item.monto })) },
        applications: { create: applications.map((item) => ({ cycleId: item.cycleId, monto: item.monto })) }
      }
    });
    return payment.id;
  });

  return getPaymentDetail(clientId, paymentId);
}

/** R13: anular deshace lo aplicado a cada ciclo y borra su egreso. */
export async function voidInstructorPayment(clientId: string, id: string, motivo: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    await lockLedger(tx, clientId);
    const payment = await tx.instructorPayment.findFirst({ where: { id, clientId }, include: { applications: { include: { cycle: true } } } });
    if (!payment) throw new ApiError(404, "Pago no encontrado");
    if (payment.anuladoAt) throw new ApiError(409, "Este pago ya está anulado");

    for (const application of payment.applications) {
      const pagado = num(application.cycle.pagado) - num(application.monto);
      const pendiente = num(application.cycle.pendiente) + num(application.monto);
      await tx.instructorCycle.update({
        where: { id: application.cycleId },
        data: { pagado: { decrement: application.monto }, pendiente: { increment: application.monto }, situacion: settlement(pagado, pendiente) }
      });
    }
    await tx.instructorPayment.update({ where: { id }, data: { anuladoAt: now, motivoAnulacion: motivo } });
    if (payment.expenseId) await tx.expense.updateMany({ where: { id: payment.expenseId, clientId }, data: { deletedAt: now } });
  });
  // Un ciclo que se queda sin pagos vuelve a recalcularse con lo ultimo.
  await ensureInstructorLedger(clientId, now);
  return getPaymentDetail(clientId, id);
}

const paymentInclude = {
  instructor: { select: { id: true, nombre: true, apellido: true, color: true } },
  methods: true,
  applications: { include: { cycle: true } }
} satisfies Prisma.InstructorPaymentInclude;

function serializePayment(payment: Prisma.InstructorPaymentGetPayload<{ include: typeof paymentInclude }>) {
  const cycles = [...payment.applications].sort((a, b) => a.cycle.inicio.getTime() - b.cycle.inicio.getTime());
  return {
    id: payment.id,
    tipo: payment.tipo,
    instructor: { id: payment.instructor.id, nombre: instructorName(payment.instructor), color: payment.instructor.color },
    monto: Math.round(num(payment.monto)),
    fecha: payment.fecha.toISOString(),
    nota: payment.nota,
    // D8: en dos formas queda como Mixto con su desglose.
    metodo: payment.methods.length > 1 ? "MIXTO" : (payment.methods[0]?.metodo ?? "OTRO"),
    metodos: payment.methods.map((item) => ({ metodo: item.metodo, monto: Math.round(num(item.monto)) })),
    ciclos: cycles.map((item) => ({
      cycleId: item.cycleId,
      etiqueta: cycleLabel(dateToDateKey(item.cycle.inicio), dateToDateKey(item.cycle.fin)),
      monto: Math.round(num(item.monto))
    })),
    anulado: Boolean(payment.anuladoAt),
    motivoAnulacion: payment.motivoAnulacion,
    tieneEgreso: Boolean(payment.expenseId)
  };
}

export type InstructorPaymentItem = ReturnType<typeof serializePayment>;

/**
 * R13: historial agrupado por ciclo (el ultimo ciclo al que aplico cada pago),
 * del mas reciente al mas viejo.
 */
export async function listPaymentHistory(clientId: string, limit = 300) {
  const payments = await prisma.instructorPayment.findMany({
    where: { clientId },
    include: paymentInclude,
    orderBy: { fecha: "desc" },
    take: limit
  });

  const groups = new Map<string, { key: string; etiqueta: string; tipo: string; fin: string; total: number; pagos: InstructorPaymentItem[] }>();
  for (const payment of payments) {
    const item = serializePayment(payment);
    const last = [...payment.applications].sort((a, b) => b.cycle.fin.getTime() - a.cycle.fin.getTime())[0]?.cycle;
    const inicio = last ? dateToDateKey(last.inicio) : item.fecha.slice(0, 10);
    const fin = last ? dateToDateKey(last.fin) : item.fecha.slice(0, 10);
    const key = `${payment.tipo}|${inicio}|${fin}`;
    const group = groups.get(key) ?? { key, etiqueta: cycleLabel(inicio, fin), tipo: payment.tipo, fin, total: 0, pagos: [] };
    group.pagos.push(item);
    if (!item.anulado) group.total += item.monto;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.fin.localeCompare(a.fin) || a.tipo.localeCompare(b.tipo));
}

export type PaymentHistoryGroup = Awaited<ReturnType<typeof listPaymentHistory>>[number];

/** R13: el detalle con la fotografia de cada ciclo pagado (forma de pago y clases). */
export async function getPaymentDetail(clientId: string, id: string) {
  const payment = await prisma.instructorPayment.findFirst({
    where: { id, clientId },
    include: { ...paymentInclude, applications: { include: { cycle: { include: { classes: true } } } } }
  });
  if (!payment) throw new ApiError(404, "Pago no encontrado");
  const today = studioNow().dateKey;
  return {
    ...serializePayment(payment),
    detalleCiclos: [...payment.applications]
      .sort((a, b) => a.cycle.inicio.getTime() - b.cycle.inicio.getTime())
      .map((item) => {
        const pay = snapshotPay(item.cycle);
        return {
          aplicado: Math.round(num(item.monto)),
          formaDePago: pay.sueldo != null || pay.variable ? describePay(pay) : "Sin forma de pago",
          ciclo: serializeCycleView(item.cycle, today)
        };
      })
  };
}

export type InstructorPaymentDetail = Awaited<ReturnType<typeof getPaymentDetail>>;

/** R14: un egreso de un pago a instructor solo se cambia anulando el pago. */
export async function assertNotInstructorExpense(clientId: string, expenseId: string) {
  const linked = await prisma.instructorPayment.findFirst({ where: { clientId, expenseId, anuladoAt: null }, select: { id: true } });
  if (linked) throw new ApiError(409, "Este egreso es un pago a un instructor. Para cambiarlo, anula el pago en Pagos a instructores.");
}
