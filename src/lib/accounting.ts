import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { endOfCurrentMonth, startOfCurrentMonth, startOfLocalDay, startOfNextLocalDay } from "./dates";
import { ensureCurrentMonthlyPayments } from "./monthly-payments";

type AccountingSummaryRow = {
  monthly_income: Prisma.Decimal | number | string;
  supplies_income: Prisma.Decimal | number | string;
  enrollment_income: Prisma.Decimal | number | string;
  expenses: Prisma.Decimal | number | string;
  pending_today_amount: Prisma.Decimal | number | string;
  pending_enrollment_today_amount: Prisma.Decimal | number | string;
  monthly_received_this_month: Prisma.Decimal | number | string;
  enrollment_received_this_month: Prisma.Decimal | number | string;
  active_students: bigint | number;
  pending_today_payments: bigint | number;
  pending_enrollment_today_payments: bigint | number;
  overdue_payments: bigint | number;
  overdue_enrollment_payments: bigint | number;
};

export async function getAccountingSummary(clientId: string) {
  await ensureCurrentMonthlyPayments(clientId);

  const monthStart = startOfCurrentMonth();
  const monthEnd = endOfCurrentMonth();
  const todayStart = startOfLocalDay();
  const tomorrowStart = startOfNextLocalDay();

  const [summary] = await prisma.$queryRaw<AccountingSummaryRow[]>(Prisma.sql`
    WITH monthly AS (
      SELECT
        COALESCE(SUM("monto") FILTER (WHERE "estado"::text = 'PAGADO'), 0) AS monthly_income,
        COALESCE(SUM("monto") FILTER (
          WHERE "estado"::text = 'PENDIENTE'
            AND "fechaVencimiento" >= ${todayStart}
            AND "fechaVencimiento" < ${tomorrowStart}
        ), 0) AS pending_today_amount,
        COALESCE(SUM("monto") FILTER (
          WHERE "estado"::text = 'PAGADO'
            AND "fechaPago" >= ${monthStart}
            AND "fechaPago" <= ${monthEnd}
        ), 0) AS monthly_received_this_month,
        COUNT(*) FILTER (
          WHERE "estado"::text = 'PENDIENTE'
            AND "fechaVencimiento" >= ${todayStart}
            AND "fechaVencimiento" < ${tomorrowStart}
        ) AS pending_today_payments,
        COUNT(*) FILTER (
          WHERE "estado"::text = 'VENCIDO'
             OR ("estado"::text = 'PENDIENTE' AND "fechaVencimiento" < ${todayStart})
        ) AS overdue_payments
      FROM "monthly_payments"
      WHERE "clientId" = ${clientId} AND "deletedAt" IS NULL
    ),
    enrollment AS (
      SELECT
        COALESCE(SUM("monto") FILTER (WHERE "estado"::text = 'PAGADO'), 0) AS enrollment_income,
        COALESCE(SUM("monto") FILTER (
          WHERE "estado"::text = 'PENDIENTE'
            AND "fechaVencimiento" >= ${todayStart}
            AND "fechaVencimiento" < ${tomorrowStart}
        ), 0) AS pending_enrollment_today_amount,
        COALESCE(SUM("monto") FILTER (
          WHERE "estado"::text = 'PAGADO'
            AND "fechaPago" >= ${monthStart}
            AND "fechaPago" <= ${monthEnd}
        ), 0) AS enrollment_received_this_month,
        COUNT(*) FILTER (
          WHERE "estado"::text = 'PENDIENTE'
            AND "fechaVencimiento" >= ${todayStart}
            AND "fechaVencimiento" < ${tomorrowStart}
        ) AS pending_enrollment_today_payments,
        COUNT(*) FILTER (
          WHERE "estado"::text = 'VENCIDO'
             OR ("estado"::text = 'PENDIENTE' AND "fechaVencimiento" < ${todayStart})
        ) AS overdue_enrollment_payments
      FROM "enrollment_payments"
      WHERE "clientId" = ${clientId} AND "deletedAt" IS NULL
    ),
    supplies AS (
      SELECT COALESCE(SUM("monto") FILTER (WHERE "estado"::text = 'PAGADO'), 0) AS supplies_income
      FROM "supplies_payments"
      WHERE "clientId" = ${clientId} AND "deletedAt" IS NULL
    ),
    expense_totals AS (
      SELECT COALESCE(SUM("monto"), 0) AS expenses
      FROM "expenses"
      WHERE "clientId" = ${clientId} AND "deletedAt" IS NULL
    ),
    student_totals AS (
      SELECT COUNT(*) FILTER (WHERE "estado"::text = 'ACTIVO') AS active_students
      FROM "students"
      WHERE "clientId" = ${clientId} AND "deletedAt" IS NULL
    )
    SELECT *
    FROM monthly
    CROSS JOIN enrollment
    CROSS JOIN supplies
    CROSS JOIN expense_totals
    CROSS JOIN student_totals
  `);

  if (!summary) throw new Error("No se pudo calcular el resumen contable");

  const ingresosMensualidades = Number(summary.monthly_income);
  const ingresosUtiles = Number(summary.supplies_income);
  const ingresosInscripciones = Number(summary.enrollment_income);
  const totalGastos = Number(summary.expenses);
  const ingresosTotales = ingresosMensualidades + ingresosUtiles + ingresosInscripciones;

  return {
    ingresosMensualidades,
    ingresosUtiles,
    ingresosInscripciones,
    ingresosTotales,
    gastosTotales: totalGastos,
    balance: ingresosTotales - totalGastos,
    pendientesPorCobrar: Number(summary.pending_today_amount) + Number(summary.pending_enrollment_today_amount),
    pagosRecibidosEsteMes:
      Number(summary.monthly_received_this_month) + Number(summary.enrollment_received_this_month),
    estudiantesActivos: Number(summary.active_students),
    mensualidadesPendientes: Number(summary.pending_today_payments),
    mensualidadesVencidas: Number(summary.overdue_payments),
    inscripcionesPendientes: Number(summary.pending_enrollment_today_payments),
    inscripcionesVencidas: Number(summary.overdue_enrollment_payments)
  };
}
