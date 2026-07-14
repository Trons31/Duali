import { Prisma } from "@prisma/client";
import { startOfLocalDay, startOfNextLocalDay } from "@/lib/dates";
import { ensureCurrentMonthlyPayments } from "@/lib/monthly-payments";
import { prisma } from "@/lib/prisma";
import type { GroupSummary } from "@/lib/web-types";

export type DashboardDueItem = {
  id: string;
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  monto: number | string;
  fechaVencimiento: string;
  student: {
    nombre: string;
    apellido: string;
  };
  group?: {
    nombre: string;
  } | null;
};

type DashboardAlertCountsRow = {
  pending_monthly_count: bigint | number;
  overdue_monthly_count: bigint | number;
  enrollment_pending_count: bigint | number;
};

export async function getDashboardAlertCounts(clientId: string) {
  const todayStart = startOfLocalDay();
  const tomorrowStart = startOfNextLocalDay();
  const [counts] = await prisma.$queryRaw<DashboardAlertCountsRow[]>(Prisma.sql`
    WITH monthly AS (
      SELECT
        COUNT(*) FILTER (
          WHERE payment."estado"::text = 'PENDIENTE'
            AND payment."fechaVencimiento" >= ${todayStart}
            AND payment."fechaVencimiento" < ${tomorrowStart}
        ) AS pending_monthly_count,
        COUNT(*) FILTER (
          WHERE payment."estado"::text IN ('VENCIDO', 'ABONADO')
             OR (payment."estado"::text = 'PENDIENTE' AND payment."fechaVencimiento" < ${todayStart})
        ) AS overdue_monthly_count
      FROM "monthly_payments" payment
      INNER JOIN "students" student ON student."id" = payment."estudianteId"
      WHERE payment."clientId" = ${clientId}
        AND payment."deletedAt" IS NULL
        AND student."deletedAt" IS NULL
        AND student."estado"::text = 'ACTIVO'
    ),
    enrollment AS (
      SELECT COUNT(*) AS enrollment_pending_count
      FROM "enrollment_payments" payment
      INNER JOIN "students" student ON student."id" = payment."estudianteId"
      WHERE payment."clientId" = ${clientId}
        AND payment."deletedAt" IS NULL
        AND payment."estado"::text IN ('VENCIDO', 'ABONADO', 'PENDIENTE')
        AND student."deletedAt" IS NULL
        AND student."estado"::text = 'ACTIVO'
    )
    SELECT * FROM monthly CROSS JOIN enrollment
  `);

  return {
    pendingMonthlyCount: Number(counts?.pending_monthly_count ?? 0),
    overdueMonthlyCount: Number(counts?.overdue_monthly_count ?? 0),
    enrollmentPendingCount: Number(counts?.enrollment_pending_count ?? 0)
  };
}

export async function getDashboardPendingPayments(clientId: string) {
  await ensureCurrentMonthlyPayments(clientId);

  const todayStart = startOfLocalDay();
  const tomorrowStart = startOfNextLocalDay();
  const payments = await prisma.monthlyPayment.findMany({
    where: {
      clientId,
      deletedAt: null,
      OR: [
        { estado: "PENDIENTE", fechaVencimiento: { gte: todayStart, lt: tomorrowStart } },
        { estado: "ABONADO", saldoPendiente: { gt: 0 } }
      ],
      student: { estado: "ACTIVO", deletedAt: null }
    },
    orderBy: { fechaVencimiento: "asc" },
    include: { student: true, group: true, installments: { orderBy: { numero: "asc" } } }
  });
  const enrollments = await prisma.enrollmentPayment.findMany({
    where: {
      clientId,
      deletedAt: null,
      OR: [
        { estado: "PENDIENTE", fechaVencimiento: { gte: todayStart, lt: tomorrowStart } },
        { estado: "ABONADO", saldoPendiente: { gt: 0 } }
      ],
      student: { estado: "ACTIVO", deletedAt: null }
    },
    orderBy: { fechaVencimiento: "asc" },
    include: { student: { include: { group: true } }, installments: { orderBy: { numero: "asc" } } }
  });

  return [
    ...payments.map((payment) => ({ ...payment, kind: "MONTHLY_PAYMENT" as const })),
    ...enrollments.map((payment) => ({
      ...payment,
      kind: "ENROLLMENT_PAYMENT" as const,
      group: payment.student.group
    }))
  ].sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());
}

export async function getDashboardGroupSummaries(clientId: string) {
  return prisma.group.findMany({
    where: { clientId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      students: {
        where: { deletedAt: null },
        select: { id: true, estado: true, precioMensualidad: true }
      },
      _count: {
        select: { students: true, monthlyPayments: true, suppliesPayments: true }
      }
    }
  });
}

export function toJsonSafe<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function toDashboardDueItems(value: Awaited<ReturnType<typeof getDashboardPendingPayments>>) {
  return toJsonSafe(value) as unknown as DashboardDueItem[];
}

export function toGroupSummaries(value: Awaited<ReturnType<typeof getDashboardGroupSummaries>>) {
  return toJsonSafe(value) as unknown as GroupSummary[];
}
