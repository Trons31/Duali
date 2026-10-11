import { periodDates, periodInstants, rangeLabel, resolveAccountingPeriod, type AccountingPeriod } from "@/lib/accounting-period";
import { ensureInstructorLedger } from "@/lib/instructor-ledger";
import { instructorName } from "@/lib/instructors";
import { methodBreakdown, type PaymentPart } from "@/lib/payment-breakdown";
import { serializeParts } from "@/lib/payment-parts";
import { prisma } from "@/lib/prisma";
import { studioTodayKey } from "@/lib/studio-time";

// Spec 028: Contabilidad como la de CliqCut. Ingresos, egresos operativos, pagos
// a instructores (que también son egresos, como en Nubi) y el detalle por instructor.

const num = (value: unknown) => Number(value ?? 0);
const partsSelect = { methodParts: { select: { metodo: true, monto: true } } } as const;

/** Categoría con la que se agrupan los egresos que nacen de un pago a instructor. */
export const INSTRUCTOR_EXPENSE_CATEGORY = "INSTRUCTOR";

export type AccountingQuery = { filter?: string | null; from?: string | null; to?: string | null; month?: string | null; day?: string | null; cycle?: string | null };

export async function buildAccountingReport(clientId: string, query: AccountingQuery, now = new Date()) {
  const today = studioTodayKey(now);
  // Los ciclos solo existen si el estudio configuró los pagos a instructores.
  await ensureInstructorLedger(clientId, now).catch(() => false);
  const cycleRows = await prisma.instructorCycle.findMany({
    where: { clientId, tipo: "COMISION", inicio: { lte: new Date(`${today}T00:00:00.000Z`) } },
    distinct: ["inicio", "fin"],
    select: { inicio: true, fin: true },
    orderBy: { inicio: "desc" },
    take: 12
  });
  const cycles = cycleRows.map((row) => {
    const from = row.inicio.toISOString().slice(0, 10);
    const to = row.fin.toISOString().slice(0, 10);
    return { value: `${from}_${to}`, label: rangeLabel(from, to), current: from <= today && today <= to };
  });

  const period = resolveAccountingPeriod(query, today, cycles[0]?.value ?? null);
  const instants = periodInstants(period.from, period.to);

  const [monthly, enrollments, installments, packagePayments, expenses, instructorPayments, instructors, cycleClasses, salaryCycles, openCycles] =
    await Promise.all([
      prisma.monthlyPayment.findMany({
        where: { clientId, deletedAt: null, estado: "PAGADO", cantidadAbonos: 0, fechaPago: instants },
        select: { monto: true, metodoPago: true, ...partsSelect }
      }),
      prisma.enrollmentPayment.findMany({
        where: { clientId, deletedAt: null, estado: "PAGADO", cantidadAbonos: 0, fechaPago: instants },
        select: { monto: true, metodoPago: true, ...partsSelect }
      }),
      prisma.paymentInstallment.findMany({
        where: { clientId, fechaAbono: instants },
        select: { monto: true, metodoPago: true, ...partsSelect }
      }),
      prisma.memberPackagePayment.findMany({
        where: { clientId, anuladoAt: null, memberPackage: { anuladoAt: null }, fecha: instants },
        select: { monto: true, metodoPago: true, ...partsSelect }
      }),
      prisma.expense.findMany({
        where: { clientId, deletedAt: null, fecha: instants },
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        include: partsSelect
      }),
      prisma.instructorPayment.findMany({
        where: { clientId, anuladoAt: null, fecha: instants },
        select: { id: true, instructorId: true, tipo: true, monto: true, fecha: true, expenseId: true, methods: { select: { metodo: true, monto: true } } },
        orderBy: { fecha: "desc" }
      }),
      prisma.instructor.findMany({
        where: { clientId, deletedAt: null },
        select: { id: true, nombre: true, apellido: true, color: true, activo: true, sueldo: true, variable: true, valor: true },
        orderBy: [{ activo: "desc" }, { nombre: "asc" }]
      }),
      prisma.instructorCycleClass.findMany({
        where: { cycle: { clientId }, fecha: periodDates(period.from, period.to) },
        select: { ganado: true, cycle: { select: { instructorId: true } } }
      }),
      prisma.instructorCycle.findMany({
        where: { clientId, tipo: "SUELDO", fin: periodDates(period.from, period.to) },
        select: { instructorId: true, sueldo: true }
      }),
      prisma.instructorCycle.findMany({
        where: { clientId, pendiente: { gt: 0 } },
        select: { instructorId: true, pendiente: true }
      })
    ]);

  // ── Ingresos ──
  const origins = [
    { key: "paquetes", label: "Planes y clases sueltas", rows: packagePayments },
    { key: "mensualidades", label: "Mensualidades", rows: monthly },
    { key: "inscripciones", label: "Inscripciones", rows: enrollments },
    { key: "abonos", label: "Abonos de la academia", rows: installments }
  ];
  const methods = new Map<string, number>();
  for (const row of origins.flatMap((origin) => origin.rows)) {
    for (const part of methodBreakdown({ monto: num(row.monto), metodoPago: row.metodoPago, partes: serializeParts(row.methodParts) })) {
      const key = part.metodo || "SIN_METODO";
      methods.set(key, (methods.get(key) ?? 0) + part.monto);
    }
  }
  const income = {
    total: origins.reduce((sum, origin) => sum + origin.rows.reduce((acc, row) => acc + num(row.monto), 0), 0),
    count: origins.reduce((sum, origin) => sum + origin.rows.length, 0),
    byOrigin: origins
      .filter((origin) => origin.rows.length)
      .map((origin) => ({ key: origin.key, label: origin.label, count: origin.rows.length, amount: origin.rows.reduce((acc, row) => acc + num(row.monto), 0) })),
    byMethod: Array.from(methods.entries())
      .map(([metodo, amount]) => ({ metodo, amount }))
      .sort((a, b) => b.amount - a.amount)
  };

  // ── Egresos: los de un pago a instructor van aparte (como "Pagos a barberos" en CliqCut) ──
  const paymentByExpense = new Map(instructorPayments.filter((payment) => payment.expenseId).map((payment) => [payment.expenseId as string, payment]));
  const expenseItems = expenses.map((expense) => {
    const fromInstructor = paymentByExpense.get(expense.id);
    return {
      id: expense.id,
      concepto: expense.concepto,
      descripcion: expense.descripcion,
      monto: num(expense.monto),
      fecha: expense.fecha.toISOString(),
      categoria: fromInstructor ? INSTRUCTOR_EXPENSE_CATEGORY : expense.categoria,
      metodoPago: expense.metodoPago,
      partes: serializeParts(expense.methodParts) as PaymentPart[],
      origen: fromInstructor ? ("INSTRUCTOR" as const) : ("MANUAL" as const),
      instructorId: fromInstructor?.instructorId ?? null
    };
  });
  const operational = expenseItems.filter((item) => item.origen === "MANUAL");
  const toInstructors = expenseItems.filter((item) => item.origen === "INSTRUCTOR");
  const sum = (list: Array<{ monto: number }>) => list.reduce((acc, item) => acc + item.monto, 0);

  // ── Por instructor ──
  const byInstructor = instructors
    .map((instructor) => {
      const classes = cycleClasses.filter((row) => row.cycle.instructorId === instructor.id);
      const payments = instructorPayments.filter((payment) => payment.instructorId === instructor.id);
      const generado =
        classes.reduce((acc, row) => acc + num(row.ganado), 0) +
        salaryCycles.filter((row) => row.instructorId === instructor.id).reduce((acc, row) => acc + num(row.sueldo), 0);
      return {
        id: instructor.id,
        nombre: instructorName(instructor),
        color: instructor.color,
        activo: instructor.activo,
        forma: payLabel(instructor),
        clases: classes.length,
        generado: Math.round(generado),
        pagado: Math.round(payments.reduce((acc, payment) => acc + num(payment.monto), 0)),
        pagos: payments.map((payment) => ({
          id: payment.id,
          tipo: payment.tipo,
          monto: num(payment.monto),
          fecha: payment.fecha.toISOString(),
          metodos: payment.methods.map((method) => ({ metodo: method.metodo, monto: num(method.monto) }))
        })),
        // Lo que se le debe hoy, de cualquier ciclo (no solo del periodo).
        pendiente: Math.round(openCycles.filter((row) => row.instructorId === instructor.id).reduce((acc, row) => acc + num(row.pendiente), 0))
      };
    })
    // Los inactivos solo si tuvieron movimiento o se les debe algo.
    .filter((item) => item.activo || item.clases || item.pagado || item.pendiente);

  const expensesTotal = sum(expenseItems);
  return {
    period,
    cycles,
    income,
    expenses: {
      items: expenseItems,
      operativos: { total: sum(operational), count: operational.length },
      instructores: { total: sum(toInstructors), count: toInstructors.length },
      total: expensesTotal
    },
    instructors: byInstructor,
    net: income.total - expensesTotal
  };
}

function payLabel(instructor: { sueldo: unknown; variable: string | null; valor: unknown }) {
  const parts: string[] = [];
  if (num(instructor.sueldo) > 0) parts.push(`Sueldo $${num(instructor.sueldo).toLocaleString("es-CO")}`);
  const valor = num(instructor.valor);
  if (valor > 0 && instructor.variable === "ALUMNO_PORCENTAJE") parts.push(`${valor}% por alumno`);
  else if (valor > 0 && instructor.variable === "ALUMNO_FIJO") parts.push(`$${valor.toLocaleString("es-CO")} por alumno`);
  else if (valor > 0 && instructor.variable === "POR_CLASE") parts.push(`$${valor.toLocaleString("es-CO")} por clase`);
  return parts.join(" + ") || "Sin forma de pago";
}

export type AccountingReport = Awaited<ReturnType<typeof buildAccountingReport>>;
export type { AccountingPeriod };
