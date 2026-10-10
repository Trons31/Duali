"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { cn } from "@/lib/web-utils";

const sizes = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl"
} as const;

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// Modales abiertos, del mas viejo al mas nuevo: Escape y Tab solo los atiende el
// de encima (un ConfirmDialog abierto sobre el detalle de una clase, por ejemplo).
const openStack: string[] = [];

/**
 * Como en CliqCut: en el celular es una hoja pegada abajo con su tirador; desde
 * `sm` es una tarjeta centrada, con el ancho que pida `size`. Cierra con Escape
 * o tocando el fondo, y mantiene el foco dentro mientras esta abierto.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "lg"
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof sizes;
}) {
  const [mounted, setMounted] = useState(false);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const bodyId = `${id}-body`;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // onClose suele llegar en linea; con la ref los efectos dependen solo de `open`.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const { body, documentElement } = document;
    // Un modal sobre otro: el de abajo ya bloqueo el scroll; no se toca.
    if (body.style.position === "fixed") return;
    const scrollY = window.scrollY;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlOverscroll = documentElement.style.overscrollBehavior;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyRight = body.style.right;
    const previousBodyWidth = body.style.width;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.right = previousBodyRight;
      body.style.width = previousBodyWidth;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    openStack.push(id);
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const dialog = dialogRef.current;
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      const index = openStack.lastIndexOf(id);
      if (index !== -1) openStack.splice(index, 1);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open, mounted, id]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center overflow-hidden sm:items-center sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar modal"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-950/60 motion-reduce:animate-none lg:backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-soft outline-none [transform:translateZ(0)] sm:max-h-[min(88vh,52rem)] sm:rounded-3xl",
          sizes[size]
        )}
      >
        <div className="flex justify-center pb-1 pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1.5 w-12 rounded-full bg-ink-200" />
        </div>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-ink-100 px-5 pb-4 pt-2 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-ink-950 sm:text-lg">
              {title}
            </h3>
            {description ? (
              <p id={descriptionId} className="mt-1 text-xs font-medium text-ink-500 sm:text-sm">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            aria-controls={bodyId}
            className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <FiX className="size-5" />
          </button>
        </div>
        <div
          id={bodyId}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] [contain:layout_paint_style] sm:px-6 sm:py-5"
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-ink-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">{footer}</div>
        ) : (
          <div className="shrink-0 pb-[env(safe-area-inset-bottom)] sm:hidden" aria-hidden />
        )}
      </div>
    </div>,
    document.body
  );
}
