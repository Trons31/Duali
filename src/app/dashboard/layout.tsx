import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { NotificationBootstrap } from "@/components/notifications/notification-bootstrap";
import { startOfLocalDay, startOfNextLocalDay } from "@/lib/dates";
import { ensureCurrentMonthlyPayments } from "@/lib/monthly-payments";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/web-auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id || !session?.user?.email) {
    redirect("/auth/login");
  }

  const clientId = session.user.id;
  await ensureCurrentMonthlyPayments(clientId);

  const todayStart = startOfLocalDay();
  const tomorrowStart = startOfNextLocalDay();

  const [pendingMonthlyCount, overdueMonthlyCount, enrollmentPendingCount] = await Promise.all([
    prisma.monthlyPayment.count({
      where: {
        clientId,
        deletedAt: null,
        estado: "PENDIENTE",
        fechaVencimiento: { gte: todayStart, lt: tomorrowStart },
        student: { estado: "ACTIVO", deletedAt: null }
      }
    }),
    prisma.monthlyPayment.count({
      where: {
        clientId,
        deletedAt: null,
        student: { estado: "ACTIVO", deletedAt: null },
        OR: [{ estado: "VENCIDO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } }]
      }
    }),
    prisma.enrollmentPayment.count({
      where: {
        clientId,
        deletedAt: null,
        student: { estado: "ACTIVO", deletedAt: null },
        OR: [{ estado: "VENCIDO" }, { estado: "PENDIENTE" }]
      }
    })
  ]);

  const alerts = [
    overdueMonthlyCount > 0
      ? {
          label: `${overdueMonthlyCount} mensualidad${overdueMonthlyCount === 1 ? "" : "es"} vencida${overdueMonthlyCount === 1 ? "" : "s"}`,
          tone: "danger" as const
        }
      : null,
    pendingMonthlyCount > 0
      ? {
          label: `${pendingMonthlyCount} cobro${pendingMonthlyCount === 1 ? "" : "s"} para hoy`,
          tone: "warning" as const
        }
      : null,
    enrollmentPendingCount > 0
      ? {
          label: `${enrollmentPendingCount} inscripcion${enrollmentPendingCount === 1 ? "" : "es"} por cobrar`,
          tone: "info" as const
        }
      : null
  ].filter((alert): alert is { label: string; tone: "danger" | "warning" | "info" } => alert !== null);

  return (
    <DashboardShell
      user={session.user}
      alerts={alerts.length ? alerts : [{ label: "Todo al dia", tone: "success" as const }]}
    >
      <NotificationBootstrap />
      {children}
      <div className="h-24 xl:hidden" />
    </DashboardShell>
  );
}
