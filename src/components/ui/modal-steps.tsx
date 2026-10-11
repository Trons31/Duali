"use client";

import type { CSSProperties, ReactNode } from "react";
import { FiCheck } from "react-icons/fi";
import { cn, currency } from "@/lib/web-utils";

const VISIBLE_STEPS = 3;

/**
 * Spec 027 R6: la tira de pasos de los formularios por pasos (como ModalSteps de
 * CliqCut). Se ven tres pasos a la vez y la tira corre sola con el paso activo;
 * los pasos ya hechos llevan un check y se pueden tocar para volver.
 */
export function ModalSteps({
  steps,
  current,
  onSelect
}: {
  steps: string[];
  /** Paso activo, empezando en 0. */
  current: number;
  onSelect?: (index: number) => void;
}) {
  const active = Math.max(0, Math.min(current, steps.length - 1));
  const offset = Math.max(0, Math.min(active - 1, steps.length - VISIBLE_STEPS));
  const basis = 100 / Math.min(VISIBLE_STEPS, steps.length);

  return (
    <div className="overflow-hidden" role="group" aria-label={`Paso ${active + 1} de ${steps.length}`}>
      <div
        className="-mx-1 flex transition-transform duration-300 ease-out [transform:translateX(var(--step-shift))]"
        style={{ "--step-shift": `-${offset * basis}%` } as CSSProperties}
      >
        {steps.map((label, index) => {
          const done = index < active;
          const isActive = index === active;
          const canGoBack = done && Boolean(onSelect);
          return (
            <div key={label} className="shrink-0 px-1" style={{ flexBasis: `${basis}%` }}>
              <button
                type="button"
                disabled={!canGoBack}
                aria-current={isActive ? "step" : undefined}
                onClick={() => canGoBack && onSelect?.(index)}
                className={cn(
                  "flex w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2.5 transition-colors",
                  isActive
                    ? "border-brand-500 bg-white text-brand-700"
                    : done
                      ? cn("border-brand-200 bg-brand-50 text-brand-700", canGoBack && "hover:bg-brand-100")
                      : "border-ink-200 bg-ink-50 text-ink-400"
                )}
              >
                <span className="shrink-0 text-xs font-black">{done ? <FiCheck className="size-4" aria-hidden /> : index + 1}</span>
                <span className="min-w-0 truncate text-xs font-bold">{label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Resumen de lo que se cobra: filas etiqueta/valor y el total al final (spec 027 D7). */
export function PaymentSummary({
  rows,
  totalLabel,
  total,
  children
}: {
  rows: Array<{ label: ReactNode; value: number; tone?: "muted" | "discount" | "debt" }>;
  totalLabel: string;
  total: number;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-4">
      <ul className="space-y-1.5 text-sm">
        {rows.map((row, index) => (
          <li
            key={index}
            className={cn(
              "flex items-start justify-between gap-3",
              row.tone === "muted" ? "text-ink-500" : row.tone === "discount" ? "text-brand-700" : row.tone === "debt" ? "text-amber-700" : "text-ink-700"
            )}
          >
            <span className="min-w-0">{row.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {row.tone === "discount" ? "−" : ""}
              {currency(row.value)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ink-200 pt-3">
        <span className="text-sm font-bold text-ink-900">{totalLabel}</span>
        <span className="text-2xl font-black tracking-tight text-ink-950 tabular-nums">{currency(total)}</span>
      </div>
      {children}
    </div>
  );
}
