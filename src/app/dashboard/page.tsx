import { PageHeader } from "@/components/ui/page-header";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { apiFetch } from "@/lib/server-api";
import type { AccountingSummary, NotificationItem } from "@/lib/web-types";

type DueItem = {
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

export default async function DashboardPage() {
  const [summary, pending, overdue, notificationPayload] = await Promise.all([
    apiFetch<AccountingSummary>("/api/accounting/summary"),
    apiFetch<DueItem[]>("/api/monthly-payments/pending"),
    apiFetch<DueItem[]>("/api/monthly-payments/overdue"),
    apiFetch<{ notifications: NotificationItem[] }>("/api/notifications?afterSequence=0&limit=20")
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Centro de mando"
        title="Tu operación, clara y a tiempo"
        description="Desde aquí controlas cobros, riesgo vencido, actividad reciente y recordatorios del administrador."
      />
      <DashboardHome
        summary={summary}
        pending={pending}
        overdue={overdue}
        notifications={notificationPayload.notifications}
      />
    </div>
  );
}
