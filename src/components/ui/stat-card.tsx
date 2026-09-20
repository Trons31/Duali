import type { ReactNode } from "react";
import { cn } from "@/lib/web-utils";

/**
 * Tarjeta de metrica del panel.
 *
 * El color vive solo en el chip del icono: el valor va siempre en tinta
 * oscura. Con cada tarjeta pintando su importe de un color distinto la fila se
 * leia como cuatro piezas sueltas en vez de como un bloque.
 */

const TONES = {
  brand: "bg-brand-50 text-brand-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  purple: "bg-violet-50 text-violet-600"
} as const;

export type StatCardTone = keyof typeof TONES;

export function StatCard({
  title,
  value,
  caption,
  icon,
  tone = "brand"
}: {
  title: string;
  value: string;
  caption?: string;
  icon: ReactNode;
  tone?: StatCardTone;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-medium text-ink-500">{title}</span>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>{icon}</div>
      </div>
      <p className="break-words text-xl font-bold tabular-nums text-ink-950 sm:text-2xl">{value}</p>
      {caption ? <p className="mt-1 break-words text-xs text-ink-400">{caption}</p> : null}
    </article>
  );
}
