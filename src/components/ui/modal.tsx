"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { cn } from "@/lib/web-utils";

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const modalBodyId = useMemo(() => `modal-body-${Math.random().toString(36).slice(2, 9)}`, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const { body, documentElement } = document;
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

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-hidden">
      <button
        type="button"
        aria-label="Cerrar modal"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/60"
      />
      <div className="relative flex h-full items-end sm:justify-center sm:p-4">
        <div className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[30px] bg-white shadow-soft [transform:translateZ(0)] sm:mt-auto sm:max-h-[84vh] sm:max-w-2xl sm:rounded-[30px]">
        <div className="px-5 pt-3 sm:hidden">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-ink-200" />
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <h3 className="text-base font-bold text-ink-950 sm:text-lg">{title}</h3>
            {description ? <p className="mt-1 text-xs font-medium text-ink-500 sm:text-sm">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            aria-controls={modalBodyId}
            className="rounded-full p-2 text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <FiX className="size-4" />
          </button>
        </div>
        <div
          id={modalBodyId}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] [contain:layout_paint_style] sm:px-6 sm:py-5 [&::-webkit-scrollbar]:hidden"
          )}
        >
          {children}
        </div>
        {footer ? <div className="border-t border-ink-100 px-5 py-4 sm:px-6">{footer}</div> : null}
      </div>
      </div>
    </div>,
    document.body
  );
}
