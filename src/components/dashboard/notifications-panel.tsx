"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { clientApiFetch } from "@/lib/client-api";
import { formatDateTime } from "@/lib/web-utils";
import type { NotificationItem } from "@/lib/web-types";

export function NotificationsPanel({ notifications }: { notifications: NotificationItem[] }) {
  const { data: session } = useSession();
  const router = useRouter();

  async function markAsRead(notificationId: string, sequence: number) {
    const token = session?.user.apiToken;
    if (!token) return;

    await clientApiFetch("/api/notifications", token, {
      method: "POST",
      body: JSON.stringify({
        action: "mark-read",
        notificationIds: [notificationId],
        uptoSequence: sequence
      })
    })
      .then(() => {
        sileo.success({ title: "Notificación marcada como leída" });
        router.refresh();
      })
      .catch((error: Error) => {
        sileo.error({ title: error.message });
      });
  }

  return (
    <div className="shell-card overflow-hidden">
      {notifications.length ? (
        notifications.map((notification, index) => (
          <div key={notification.id} className={index === 0 ? "px-5 py-5" : "soft-divider px-5 py-5"}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-bold text-ink-950">{notification.title}</h3>
                  <StatusBadge value={notification.status} />
                </div>
                <p className="mt-2 text-sm leading-6 text-ink-500">{notification.body}</p>
                {notification.error ? (
                  <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{notification.error}</p>
                ) : null}
                <p className="mt-3 text-xs text-ink-400">{formatDateTime(notification.createdAt)}</p>
              </div>
              {notification.status !== "LEIDA" ? (
                <Button type="button" variant="secondary" onClick={() => markAsRead(notification.id, notification.sequence)}>
                  Marcar leída
                </Button>
              ) : null}
            </div>
          </div>
        ))
      ) : (
        <div className="px-5 py-10 text-sm text-ink-500">Aún no tienes notificaciones para mostrar.</div>
      )}
    </div>
  );
}
