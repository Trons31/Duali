import { cn } from "@/lib/web-utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "default"
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "from-emerald-100 via-white to-white"
      : tone === "warning"
        ? "from-amber-100 via-white to-white"
        : tone === "danger"
          ? "from-rose-100 via-white to-white"
          : "from-brand-100 via-white to-white";

  return (
    <article className={cn("shell-card bg-gradient-to-br p-5", toneClass)}>
      <p className="text-sm font-semibold text-ink-500">{label}</p>
      <p className="mt-4 text-3xl font-black tracking-tight text-ink-950">{value}</p>
      {hint ? <p className="mt-2 text-sm text-ink-500">{hint}</p> : null}
    </article>
  );
}
