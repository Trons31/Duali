"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { clientApiFetch } from "@/lib/client-api";
import { getNotificationCursor, setNotificationCursor } from "@/lib/notification-store";

type NotificationItem = {
  id: string;
  sequence: number;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
};

function notificationHref(notification: NotificationItem) {
  const type = String(notification.data?.type ?? "");
  if (type.includes("OVERDUE")) return "/dashboard/cobros/vencidos";
  if (type.includes("DUE")) return "/dashboard/cobros/pendientes";
  return "/dashboard/notificaciones";
}

export function NotificationBootstrap() {
  const { data: session, status } = useSession();
  const runningRef = useRef(false);
  const [permissionPrompted, setPermissionPrompted] = useState(false);

  const token = session?.user?.apiToken ?? null;

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (permissionPrompted) return;

    setPermissionPrompted(true);

    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
  }, [permissionPrompted, status]);

  useEffect(() => {
    if (status !== "authenticated" || !token) return;

    const apiToken = token;

    let mounted = true;

    async function syncNotifications() {
      if (!mounted || runningRef.current) return;
      runningRef.current = true;

      try {
        const afterSequence = await getNotificationCursor();
        const payload = await clientApiFetch<{
          notifications: NotificationItem[];
          lastSequence: number;
        }>(`/api/notifications?afterSequence=${afterSequence}&limit=100`, apiToken, {
          method: "GET"
        }).catch(() => null);

        if (!payload?.notifications?.length) return;

        const unseen = payload.notifications;
        const maxSequence = Math.max(afterSequence, ...unseen.map((item) => item.sequence));
        await setNotificationCursor(maxSequence);

        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          unseen.forEach((notification) => {
            const browserNotification = new Notification(notification.title, {
              body: notification.body,
              icon: "/logo/icon.png",
              data: { href: notificationHref(notification) }
            });

            browserNotification.onclick = () => {
              const href = String(browserNotification.data?.href ?? "/dashboard/notificaciones");
              window.focus();
              window.location.assign(href);
              browserNotification.close();
            };
          });
        }

        sileo.success({
          title:
            unseen.length === 1
              ? unseen[0].title
              : `${unseen.length} recordatorios nuevos listos para revisar`
        });

        await clientApiFetch(
          "/api/notifications",
          apiToken,
          {
            method: "POST",
            body: JSON.stringify({
              action: "ack-delivered",
              notificationIds: unseen.map((item) => item.id),
              uptoSequence: maxSequence
            })
          }
        ).catch(() => undefined);
      } finally {
        runningRef.current = false;
      }
    }

    void syncNotifications();

    const intervalId = window.setInterval(() => {
      void syncNotifications();
    }, 45_000);

    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void syncNotifications();
      }
    };

    window.addEventListener("online", syncNotifications);
    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("online", syncNotifications);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [status, token]);

  const banner = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (!("Notification" in window)) return null;
    if (Notification.permission === "granted") return null;

    return (
      <div className="mb-6 shell-card border border-brand-100 bg-brand-50/80 px-4 py-4 text-sm text-brand-900">
        Activa las notificaciones del navegador para recibir recordatorios del administrador también en web.
      </div>
    );
  }, []);

  return banner;
}
