"use client";

import { useEffect } from "react";
import { FiBell, FiCalendar, FiDollarSign, FiFileText, FiX } from "react-icons/fi";
import { BrandLogo } from "@/components/shared/brand-logo";
import type { PromptMode } from "@/lib/notification-prompt";

/**
 * Spec 026: invitación propia antes del diálogo del navegador.
 *
 * El del sistema es una sola línea sin contexto y, si lo bloquean, la página no
 * puede volver a pedirlo. Explicando primero para qué sirven, el "no" cae aquí
 * --donde se puede reintentar-- y no en el permiso real. Misma estructura que
 * `NotificationsPrompt` de CliqCut-Shop, con la marca de Duali.
 */
export function NotificationsPrompt({
  mode,
  onClose,
  onActivate
}: {
  mode: Exclude<PromptMode, "hidden">;
  onClose: () => void;
  onActivate: () => void;
}) {
  // Escape cierra y el fondo no se desplaza mientras está abierto.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const bodyOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = bodyOverflow;
    };
  }, [onClose]);

  const canActivate = mode === "ask";

  return (
    <div
      className="fixed inset-0 z-[80] flex animate-fade-in items-end justify-center bg-ink-950/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-prompt-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-t-4xl bg-white shadow-card sm:rounded-4xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 rounded-full p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700 sm:right-5 sm:top-5"
        >
          <FiX className="size-5" />
        </button>

        <div className="px-7 pb-2 pt-9 text-center">
          <Illustration />

          <h2
            id="notifications-prompt-title"
            className="mt-6 text-[22px] font-black leading-tight tracking-tight text-ink-950"
          >
            {mode === "blocked"
              ? "Las notificaciones están bloqueadas"
              : mode === "ios-install"
                ? "Instala Duali para recibir avisos"
                : "Activa las notificaciones de tu estudio"}
          </h2>

          <p className="mt-2.5 text-sm leading-relaxed text-ink-500">
            {mode === "blocked"
              ? "Tu navegador las tiene desactivadas para Duali. Permítelas desde el candado junto a la dirección y vuelve a cargar la página."
              : mode === "ios-install"
                ? "En iPhone los avisos solo llegan con Duali en tu pantalla de inicio: toca Compartir en Safari y luego \"Agregar a inicio\"."
                : "Te avisamos al instante cuando pase algo en tu estudio, aunque no tengas Duali abierto."}
          </p>

          {canActivate && (
            <ul className="mt-6 space-y-2.5 text-left">
              <Benefit icon={FiCalendar} text="Cuando un cliente reserve o compre un plan" />
              <Benefit icon={FiFileText} text="Cuando llegue un comprobante por revisar" />
              <Benefit icon={FiDollarSign} text="Recordatorios de cobros y vencimientos" />
            </ul>
          )}
        </div>

        {/* Acciones al pie: la decisión queda donde está el pulgar. */}
        <div className="mt-7 flex border-t border-ink-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-5 py-4 text-[15px] font-bold text-ink-500 transition hover:bg-ink-50"
          >
            {canActivate ? "Ahora no" : "Entendido"}
          </button>

          {canActivate && (
            <button
              type="button"
              onClick={onActivate}
              className="flex-[2] bg-brand-600 px-5 py-4 text-[15px] font-black text-white transition hover:bg-brand-700"
            >
              Activar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Teléfono con Duali en pantalla y la campana encima, en CSS para no depender de un asset. */
function Illustration() {
  return (
    <div className="relative mx-auto size-[136px]">
      <div className="absolute inset-0 rounded-full bg-brand-50" />

      <div className="absolute bottom-0 left-1/2 flex h-[104px] w-[76px] -translate-x-1/2 flex-col items-center rounded-2xl border-2 border-ink-200 bg-white">
        <div className="mt-2 h-1 w-6 rounded-full bg-ink-200" />
        <BrandLogo size={36} className="mt-5" />
      </div>

      <div className="absolute right-1 top-1 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 p-3.5 shadow-lg shadow-brand-600/30">
        <FiBell className="size-6 text-white" />
      </div>

      <span className="absolute right-0 top-0 flex size-[22px] items-center justify-center rounded-full border-[2.5px] border-white bg-rose-500 text-[11px] font-black text-white">
        1
      </span>
    </div>
  );
}

function Benefit({ icon: Icon, text }: { icon: typeof FiBell; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-xl bg-brand-50">
        <Icon className="size-[17px] text-brand-600" />
      </span>
      <span className="text-[13.5px] font-bold text-ink-700">{text}</span>
    </li>
  );
}
