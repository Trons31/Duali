"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { focusRing } from "@/components/public/public-shell";

/**
 * Confirmacion de la pagina publica (spec 019 R2): el mismo papel que el
 * ConfirmDialog del panel, con el estilo de la pagina. Hoja inferior en el
 * celular, tarjeta centrada en computador; Escape o tocar fuera = Volver.
 */
export function PublicConfirm({
  open,
  title,
  children,
  confirmText,
  loading = false,
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmText: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, loading, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="public-confirm-title">
      <button type="button" aria-label="Volver" onClick={() => (loading ? undefined : onClose())} className="absolute inset-0 animate-fade-in bg-ink-950/50 motion-reduce:animate-none" />
      <div className="relative w-full max-w-md animate-fade-in rounded-t-[2rem] bg-sand p-6 shadow-soft motion-reduce:animate-none sm:rounded-[2rem]">
        <h2 id="public-confirm-title" className="font-display text-3xl italic leading-none">
          {title}
        </h2>
        <div className="mt-3 text-sm text-ink-600">{children}</div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={`min-h-12 flex-1 rounded-full border border-black/10 bg-white text-sm font-semibold disabled:opacity-60 ${focusRing}`}
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`min-h-12 flex-1 rounded-full bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60 ${focusRing}`}
          >
            {loading ? "Un momento…" : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
