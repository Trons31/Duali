import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/server-api";
import type { NotificationItem } from "@/lib/web-types";

export default async function NotificationsPage() {
  const payload = await apiFetch<{ notifications: NotificationItem[] }>("/api/notifications?afterSequence=0&limit=100");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Bandeja"
        title="Notificaciones del administrador"
        description="Aquí ves los recordatorios que el sistema genera para cobros pendientes, vencidos y eventos manuales."
      />
      <NotificationsPanel notifications={payload.notifications} />
    </div>
  );
}
