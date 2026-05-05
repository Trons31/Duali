import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { apiFetch } from "@/lib/server-api";
import type { NotificationItem } from "@/lib/web-types";

export default async function NotificationsPage() {
  const payload = await apiFetch<{ notifications: NotificationItem[] }>("/api/notifications?afterSequence=0&limit=100");

  return (
    <div className="space-y-6">
      <section className="px-1 py-1 sm:px-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-ink-400">Bandeja</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">
          Notificaciones del administrador
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-500 sm:text-base">
          Aqui ves los recordatorios que el sistema genera para cobros pendientes, vencidos y eventos manuales.
        </p>
      </section>

      <NotificationsPanel notifications={payload.notifications} />
    </div>
  );
}
