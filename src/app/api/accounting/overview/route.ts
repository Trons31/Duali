import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { calculateTotalDebtAfterInstallment, getOpenDebtByStudent } from "@/lib/student-debt";
import { expenseCategoryLabel } from "@/lib/expense-categories";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

function resolvePeriod(yearParam?: string | null, monthParam?: string | null) {
  const now = new Date();
  const year = Number(yearParam ?? now.getFullYear());
  const month = Number(monthParam ?? now.getMonth() + 1);
  const safeYear = Number.isFinite(year) ? year : now.getFullYear();
  const safeMonth = month >= 1 && month <= 12 ? month : now.getMonth() + 1;
  const from = new Date(safeYear, safeMonth - 1, 1, 0, 0, 0, 0);
  const to = new Date(safeYear, safeMonth, 0, 23, 59, 59, 999);

  return {
    year: safeYear,
    month: safeMonth,
    from,
    to,
    monthLabel: `${MONTH_NAMES[safeMonth - 1]} ${safeYear}`
  };
}

function normalizeMethod(method: string | null) {
  if (!method) return "Sin metodo";

  switch (method.toUpperCase()) {
    case "EFECTIVO":
      return "Efectivo";
    case "TRANSFERENCIA":
      return "Transferencia";
    case "NEQUI":
      return "Nequi";
    case "DAVIPLATA":
      return "Daviplata";
    default:
      return method;
  }
}

function money(value: number | string | { toString(): string }) {
  return Number(value).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  });
}

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const period = resolvePeriod(url.searchParams.get("year"), url.searchParams.get("month"));

    const monthlyPayments = await prisma.monthlyPayment.findMany({
      where: {
        clientId,
        deletedAt: null,
        estado: "PAGADO",
        cantidadAbonos: 0,
        fechaPago: { gte: period.from, lte: period.to }
      },
      orderBy: [{ fechaPago: "desc" }, { createdAt: "desc" }],
      include: {
        student: true,
        group: true
      }
    });
    const enrollmentPayments = await prisma.enrollmentPayment.findMany({
      where: {
        clientId,
        deletedAt: null,
        estado: "PAGADO",
        cantidadAbonos: 0,
        fechaPago: { gte: period.from, lte: period.to }
      },
      orderBy: [{ fechaPago: "desc" }, { createdAt: "desc" }],
      include: {
        student: {
          include: {
            group: true
          }
        }
      }
    });
    const installments = await prisma.paymentInstallment.findMany({
      where: {
        clientId,
        fechaAbono: { gte: period.from, lte: period.to }
      },
      orderBy: [{ fechaAbono: "desc" }, { createdAt: "desc" }],
      include: {
        student: true,
        monthlyPayment: {
          include: {
            group: true
          }
        },
        enrollmentPayment: {
          include: {
            student: {
              include: {
                group: true
              }
            }
          }
        }
      }
    });
    const expenses = await prisma.expense.findMany({
      where: {
        clientId,
        deletedAt: null,
        fecha: { gte: period.from, lte: period.to }
      },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }]
    });
    const debtByStudent = await getOpenDebtByStudent(
      clientId,
      installments.map((installment) => installment.estudianteId)
    );

    const ingresosMensualidades = monthlyPayments.reduce((sum, payment) => sum + Number(payment.monto), 0);
    const ingresosInscripciones = enrollmentPayments.reduce((sum, payment) => sum + Number(payment.monto), 0);
    const ingresosAbonos = installments.reduce((sum, installment) => sum + Number(installment.monto), 0);
    const ingresos = ingresosMensualidades + ingresosInscripciones + ingresosAbonos;
    const egresos = expenses.reduce((sum, expense) => sum + Number(expense.monto), 0);

    const methodMap = new Map<string, { amount: number; count: number }>();

    for (const payment of monthlyPayments) {
      const key = normalizeMethod(payment.metodoPago);
      const current = methodMap.get(key) ?? { amount: 0, count: 0 };
      methodMap.set(key, {
        amount: current.amount + Number(payment.monto),
        count: current.count + 1
      });
    }

    for (const payment of enrollmentPayments) {
      const key = normalizeMethod(payment.metodoPago);
      const current = methodMap.get(key) ?? { amount: 0, count: 0 };
      methodMap.set(key, {
        amount: current.amount + Number(payment.monto),
        count: current.count + 1
      });
    }

    for (const installment of installments) {
      const key = normalizeMethod(installment.metodoPago);
      const current = methodMap.get(key) ?? { amount: 0, count: 0 };
      methodMap.set(key, {
        amount: current.amount + Number(installment.monto),
        count: current.count + 1
      });
    }

    const paymentMethods = Array.from(methodMap.entries())
      .map(([method, value]) => ({
        method,
        amount: value.amount,
        count: value.count,
        percentage: ingresos > 0 ? Math.round((value.amount / ingresos) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    const movements = [
      ...monthlyPayments.map((payment) => ({
        id: payment.id,
        date: (payment.fechaPago ?? payment.createdAt).toISOString(),
        type: "MENSUALIDAD" as const,
        title: `${payment.student.nombre} ${payment.student.apellido}`,
        subtitle: `Mensualidad · ${normalizeMethod(payment.metodoPago)}${payment.group?.nombre ? ` · ${payment.group.nombre}` : ""}`,
        amount: Number(payment.monto),
        direction: "income" as const
      })),
      ...enrollmentPayments.map((payment) => ({
        id: payment.id,
        date: (payment.fechaPago ?? payment.createdAt).toISOString(),
        type: "INSCRIPCION" as const,
        title: `${payment.student.nombre} ${payment.student.apellido}`,
        subtitle: `Inscripcion · ${normalizeMethod(payment.metodoPago)}${payment.student.group?.nombre ? ` · ${payment.student.group.nombre}` : ""}`,
        amount: Number(payment.monto),
        direction: "income" as const
      })),
      ...installments.map((installment) => {
        const monthlyPayment = installment.monthlyPayment;
        const enrollmentPayment = installment.enrollmentPayment;
        const group = monthlyPayment?.group ?? enrollmentPayment?.student.group ?? null;
        const totalDebtAfterInstallment = calculateTotalDebtAfterInstallment(installment, debtByStudent);

        return {
          id: installment.id,
          date: installment.fechaAbono.toISOString(),
          type: "ABONO" as const,
          title: `${installment.student.nombre} ${installment.student.apellido}`,
          subtitle: `${installment.concepto} · ${normalizeMethod(installment.metodoPago)}${group?.nombre ? ` · ${group.nombre}` : ""} · Deuda total ${money(totalDebtAfterInstallment)}`,
          amount: Number(installment.monto),
          remainingBalance: totalDebtAfterInstallment,
          direction: "income" as const
        };
      }),
      ...expenses.map((expense) => ({
        id: expense.id,
        date: expense.fecha.toISOString(),
        type: "EGRESO" as const,
        title: expense.concepto,
        subtitle: `${expense.categoria ? expenseCategoryLabel(expense.categoria) : "Egreso"}${expense.descripcion ? ` · ${expense.descripcion}` : ""}`,
        amount: Number(expense.monto),
        direction: "expense" as const
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return ok({
      period: {
        year: period.year,
        month: period.month,
        monthLabel: period.monthLabel,
        from: period.from.toISOString(),
        to: period.to.toISOString()
      },
      summary: {
        ingresos,
        egresos,
        balance: ingresos - egresos,
        movimientos: movements.length
      },
      paymentMethods,
      movements
    });
  } catch (error) {
    return handleError(error);
  }
}
