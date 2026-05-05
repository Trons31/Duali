import { cn } from "@/lib/web-utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="space-y-2">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">{eyebrow}</p> : null}
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">{title}</h1>
        {description ? <p className="max-w-2xl text-sm leading-6 text-ink-500 sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
