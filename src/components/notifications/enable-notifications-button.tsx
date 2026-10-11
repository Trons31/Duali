"use client";

import { useEffect, useState } from "react";
import { FiBell } from "react-icons/fi";
import { OPEN_NOTIFICATIONS_PROMPT_EVENT } from "@/lib/notification-prompt";

/** Spec 026 R6: activar después de haber dicho "Ahora no". Oculto si ya están activas. */
export function EnableNotificationsButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function refresh() {
      // Sin `Notification` solo hay algo que decir en iPhone/iPad (instalar Duali).
      setVisible("Notification" in window ? Notification.permission !== "granted" : /iPad|iPhone|iPod/.test(navigator.userAgent));
    }

    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_NOTIFICATIONS_PROMPT_EVENT))}
      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700"
    >
      <FiBell className="size-4" />
      Activar en este dispositivo
    </button>
  );
}
