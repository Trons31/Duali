"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const scrollY = window.scrollY;
    const { body, documentElement } = document;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;

    documentElement.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end overflow-hidden bg-ink-950/40 backdrop-blur-[2px] sm:justify-center sm:p-4">
      <div className="w-full rounded-t-[30px] bg-white shadow-soft sm:mt-auto sm:max-w-2xl sm:rounded-[30px]">
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
            className="rounded-full p-2 text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <FiX className="size-4" />
          </button>
        </div>
        <div className={cn("max-h-[78vh] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5")}>{children}</div>
        {footer ? <div className="border-t border-ink-100 px-5 py-4 sm:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
