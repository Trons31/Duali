import { cn } from "@/lib/web-utils";

const styles: Record<string, string> = {
  ACTIVO: "bg-emerald-100 text-emerald-700",
  PAUSADO: "bg-sky-100 text-sky-700",
  DESACTIVADO: "bg-slate-100 text-slate-600",
  INACTIVO: "bg-slate-100 text-slate-600",
  PAGADO: "bg-emerald-100 text-emerald-700",
  PENDIENTE: "bg-amber-100 text-amber-700",
  ABONADO: "bg-sky-100 text-sky-700",
  VENCIDO: "bg-rose-100 text-rose-700",
  NO_APLICA: "bg-slate-100 text-slate-600",
  ENVIADA: "bg-brand-100 text-brand-700",
  LEIDA: "bg-slate-100 text-slate-700",
  FALLIDA: "bg-rose-100 text-rose-700",
  REINTENTANDO: "bg-amber-100 text-amber-700",
  ENCOLADA: "bg-sky-100 text-sky-700",
  PROCESANDO: "bg-violet-100 text-violet-700",
  OMITIDA: "bg-slate-100 text-slate-700",
  ENTREGADA: "bg-emerald-100 text-emerald-700"
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        styles[value] ?? "bg-ink-100 text-ink-700"
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
