import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { NotificationBootstrap } from "@/components/notifications/notification-bootstrap";
import { getDashboardAlertCounts } from "@/lib/dashboard-data";
import { ensureCurrentMonthlyPayments } from "@/lib/monthly-payments";
import { ensureClientSubscription, serializeSubscription } from "@/lib/subscriptions";
import { auth } from "@/lib/web-auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id || !session?.user?.email) {
    redirect("/auth/login");
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin");
  }

  if (session.user.role !== "CLIENT" || !session.user.apiToken) {
    redirect("/auth/login?session=expired");
  }

  const clientId = session.user.id;
  await ensureCurrentMonthlyPayments(clientId);

  const [alertCounts, subscription] = await Promise.all([
    getDashboardAlertCounts(clientId),
    ensureClientSubscription(clientId)
  ]);
  const { pendingMonthlyCount, overdueMonthlyCount, enrollmentPendingCount } = alertCounts;

  const plan = serializeSubscription(subscription);

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
          label: `${enrollmentPendingCount} inscripción${enrollmentPendingCount === 1 ? "" : "es"} por cobrar`,
          tone: "info" as const
        }
      : null
  ].filter((alert): alert is { label: string; tone: "danger" | "warning" | "info" } => alert !== null);

  return (
    <DashboardShell
      user={session.user}
      planDays={plan.daysUntilNextBilling}
      planStatus={String(plan.status)}
      alerts={alerts.length ? alerts : [{ label: "Todo al día", tone: "success" as const }]}
    >
      <NotificationBootstrap />
      {children}
    </DashboardShell>
  );
}
