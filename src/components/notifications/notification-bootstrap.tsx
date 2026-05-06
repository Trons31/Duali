"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { clientApiFetch } from "@/lib/client-api";
import { WEB_NOTIFICATION_ICON_URL } from "@/lib/branding";
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
  if (type.includes("ENROLLMENT")) return "/dashboard/inscripciones";
  if (type.includes("OVERDUE")) return "/dashboard/cobros/vencidos";
  if (type.includes("DUE")) return "/dashboard/cobros/pendientes";
  return "/dashboard/notificaciones";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function NotificationBootstrap() {
  const { data: session, status } = useSession();
  const runningRef = useRef(false);
  const [permissionPrompted, setPermissionPrompted] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined") return "unsupported";
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [foregroundFallback, setForegroundFallback] = useState(false);

  const token = session?.user?.apiToken ?? null;

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (permissionPrompted) return;

    setPermissionPrompted(true);
    setPermission(Notification.permission);

    if (Notification.permission === "default") {
      Notification.requestPermission()
        .then((result) => setPermission(result))
        .catch(() => undefined);
    }
  }, [permissionPrompted, status]);

  useEffect(() => {
    if (status !== "authenticated" || !token) return;
    if (typeof window === "undefined") return;

    const apiToken = token;
    let cancelled = false;

    async function registerWebPush() {
      if (!("Notification" in window)) {
        setForegroundFallback(false);
        return;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) {
        setForegroundFallback(Notification.permission === "granted");
        return;
      }

      const currentPermission = Notification.permission;
      setPermission(currentPermission);

      if (currentPermission !== "granted") {
        setForegroundFallback(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        const { publicKey } = await clientApiFetch<{ publicKey: string }>("/api/notifications/web-push", apiToken, {
          method: "GET"
        });

        const existingSubscription = await registration.pushManager.getSubscription();
        const subscription =
          existingSubscription ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          }));

        const subscriptionJson = subscription.toJSON();
        const endpoint = subscription.endpoint;

        await clientApiFetch("/api/notifications/web-push", apiToken, {
          method: "POST",
          body: JSON.stringify({
            endpoint,
            expirationTime: subscriptionJson.expirationTime ?? null,
            keys: subscriptionJson.keys,
            userAgent: navigator.userAgent,
            deviceName: navigator.platform
          })
        });
        if (!cancelled) {
          setForegroundFallback(false);
        }
      } catch {
        if (!cancelled) {
          setForegroundFallback(Notification.permission === "granted");
        }
      }
    }

    void registerWebPush();

    const visibilityHandler = () => {
      if (typeof window !== "undefined" && "Notification" in window) {
        setPermission(Notification.permission);
      }

      if (document.visibilityState === "visible") {
        void registerWebPush();
      }
    };

    window.addEventListener("online", registerWebPush);
    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      cancelled = true;
      window.removeEventListener("online", registerWebPush);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [status, token]);

  useEffect(() => {
    if (status !== "authenticated" || !token) return;
    if (!foregroundFallback) return;
    if (permission !== "granted") return;

    const apiToken = token;
    let mounted = true;

    async function syncNotifications() {
      if (!mounted || runningRef.current) return;
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;

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

        unseen.forEach((notification) => {
          try {
            const browserNotification = new Notification(notification.title, {
              body: notification.body,
              icon: WEB_NOTIFICATION_ICON_URL,
              data: { href: notificationHref(notification) }
            });

            browserNotification.onclick = () => {
              const href = String(browserNotification.data?.href ?? "/dashboard/notificaciones");
              window.focus();
              window.location.assign(href);
              browserNotification.close();
            };
          } catch {
            return;
          }
        });

        await setNotificationCursor(maxSequence);

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
    }, 90_000);

    const visibilityHandler = () => {
      if (typeof window !== "undefined" && "Notification" in window) {
        setPermission(Notification.permission);
      }

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
  }, [foregroundFallback, permission, status, token]);

  return null;
}
