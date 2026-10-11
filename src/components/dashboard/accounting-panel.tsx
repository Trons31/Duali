"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FiAward, FiChevronDown, FiChevronUp, FiDollarSign, FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import { ScrollHint } from "@/components/shared/scroll-hint";
import { describeMethod } from "@/components/ui/payment-breakdown";
import { ACCOUNTING_FILTERS, type AccountingFilter } from "@/lib/accounting-period";
import type { AccountingReport } from "@/lib/accounting-report";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { addDaysToKey, isoWeekday } from "@/lib/studio-time";
import { cn, currency, formatDate } from "@/lib/web-utils";

type Tab = "resumen" | "instructores" | "egresos";

const INSTRUCTOR_META = { id: "INSTRUCTOR", label: "Pagos a instructores", icon: FiAward, tone: "bg-rose-50 text-rose-700" };
const OTHER_META = EXPENSE_CATEGORIES.find((item) => item.id === "OTHER")!;
const categoryMeta = (id: string | null) =>
  id === INSTRUCTOR_META.id ? INSTRUCTOR_META : (EXPENSE_CATEGORIES.find((item) => item.id === id) ?? { ...OTHER_META, label: id || OTHER_META.label });
const SHORT_WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/**
 * Spec 028: Contabilidad como la de CliqCut. Filtros de periodo arriba, las
 * cifras del periodo, y tres vistas: Resumen, Por instructor y Egresos. Los
 * pagos a instructores son egresos (como en Nubi), contados aparte.
 */
export function AccountingPanel({ report, today }: { report: AccountingReport; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { period, income, expenses, instructors, net } = report;
  const [tab, setTab] = useState<Tab>("resumen");
  const hasInstructors = instructors.length > 0 || expenses.instructores.count > 0;
  const filters = ACCOUNTING_FILTERS.filter((item) => item.id !== "paymentcycle" || report.cycles.length);

  function go(params: Record<string, string>) {
    router.push(`${pathname}?${new URLSearchParams(params).toString()}`);
  }

  function choose(filter: AccountingFilter) {
    if (filter === "custom") return go({ filter, from: period.from, to: period.to });
    if (filter === "specificmonth") return go({ filter, month: period.month });
    if (filter === "day") return go({ filter, day: period.filter === "day" ? period.from : today });
    if (filter === "paymentcycle") return go({ filter, cycle: report.cycles[0]?.value ?? "" });
    go({ filter });
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Contabilidad</h1>
        <p className="mt-1 text-sm text-ink-500">Resumen financiero de tu negocio · {period.label}</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={period.filter === item.id}
              onClick={() => choose(item.id)}
              className={cn(
                "min-h-10 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                period.filter === item.id ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {period.filter === "custom" ? (
          <div className="grid max-w-md grid-cols-2 gap-3">
            <DateField label="Desde" type="date" value={period.from} onChange={(from) => go({ filter: "custom", from, to: period.to })} />
            <DateField label="Hasta" type="date" value={period.to} onChange={(to) => go({ filter: "custom", from: period.from, to })} />
          </div>
        ) : null}
        {period.filter === "specificmonth" ? (
          <div className="max-w-xs">
            <DateField label="Mes" type="month" value={period.month} onChange={(month) => go({ filter: "specificmonth", month })} />
          </div>
        ) : null}
        {period.filter === "day" ? <DayStrip month={period.month} selected={period.from} onSelect={(day) => go({ filter: "day", day })} /> : null}
        {period.filter === "paymentcycle" ? (
          <ScrollHint fade="white" scrollerClassName="flex gap-2 pb-1">
            {report.cycles.map((cycle) => (
              <button
                key={cycle.value}
                type="button"
                aria-pressed={period.cycle === cycle.value}
                onClick={() => go({ filter: "paymentcycle", cycle: cycle.value })}
                className={cn(
                  "min-h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold transition-colors",
                  period.cycle === cycle.value ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-ink-50 text-ink-700 hover:bg-white"
                )}
              >
                {cycle.label}
                {cycle.current ? " · actual" : ""}
              </button>
            ))}
          </ScrollHint>
        ) : null}
      </section>

      <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", hasInstructors ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <StatCard title="Ingresos" value={currency(income.total)} subtitle={`${income.count} cobro${income.count === 1 ? "" : "s"}`} icon={<FiTrendingUp />} tone="green" />
        <StatCard
          title="Egresos operativos"
          value={`-${currency(expenses.operativos.total)}`}
          subtitle={`${expenses.operativos.count} registro${expenses.operativos.count === 1 ? "" : "s"}`}
          icon={<FiTrendingDown />}
          tone="red"
        />
        {hasInstructors ? (
          <StatCard
            title="Pagos a instructores"
            value={`-${currency(expenses.instructores.total)}`}
            subtitle={`${expenses.instructores.count} pago${expenses.instructores.count === 1 ? "" : "s"} registrado${expenses.instructores.count === 1 ? "" : "s"}`}
            icon={<FiAward />}
            tone="orange"
          />
        ) : null}
        <StatCard
          title="Ganancia neta"
          value={`${net < 0 ? "-" : ""}${currency(Math.abs(net))}`}
          subtitle="Ingresos menos egresos pagados"
          icon={<FiDollarSign />}
          tone={net >= 0 ? "green" : "red"}
          className={hasInstructors ? "" : "col-span-2 lg:col-span-1"}
        />
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vistas de contabilidad">
        {(
          [
            { id: "resumen", label: "Resumen" },
            ...(hasInstructors ? [{ id: "instructores", label: "Por instructor" }] : []),
            { id: "egresos", label: `Egresos (${expenses.items.length})` }
          ] as Array<{ id: Tab; label: string }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "min-h-10 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === item.id ? "bg-brand-600 text-white" : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "resumen" ? <Summary report={report} /> : null}
      {tab === "instructores" ? <ByInstructor report={report} /> : null}
      {tab === "egresos" ? <Expenses report={report} /> : null}
    </div>
  );
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

function Summary({ report }: { report: AccountingReport }) {
  const { income, expenses, net } = report;
  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of expenses.items) totals.set(item.categoria ?? "OTHER", (totals.get(item.categoria ?? "OTHER") ?? 0) + item.monto);
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses.items]);

  return (
    <div className="space-y-4">
      <Section tone="green" icon={<FiTrendingUp />} title="Ingresos">
        {income.byOrigin.length ? (
          <ul className="divide-y divide-ink-50">
            {income.byOrigin.map((origin) => (
              <li key={origin.key} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-ink-600">
                  {origin.label} <span className="text-xs text-ink-400">· {origin.count}</span>
                </span>
                <span className="font-semibold tabular-nums text-ink-800">{currency(origin.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {income.byMethod.length ? (
          <div className="flex flex-wrap gap-2 border-t border-ink-50 px-5 py-3">
            {income.byMethod.map((item) => (
              <span key={item.metodo} className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-semibold text-ink-600">
                {describeMethod(item.metodo === "SIN_METODO" ? null : item.metodo)} · {currency(item.amount)}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-brand-100 bg-brand-50/60 px-5 py-3">
          <span className="text-sm font-bold text-brand-800">Ingresos totales del período</span>
          <span className="text-xl font-black tabular-nums text-brand-700">{currency(income.total)}</span>
        </div>
      </Section>

      <Section tone="red" icon={<FiTrendingDown />} title="Egresos">
        {byCategory.length ? (
          <>
            <ul className="divide-y divide-ink-50">
              {byCategory.map(([id, total]) => {
                const meta = categoryMeta(id);
                const Icon = meta.icon;
                const pct = expenses.total > 0 ? Math.round((total / expenses.total) * 100) : 0;
                return (
                  <li key={id} className="flex items-center gap-3 px-5 py-3">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", meta.tone)}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink-700">{meta.label}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs font-medium text-ink-400">{pct}%</span>
                          <span className="text-sm font-bold tabular-nums text-rose-600">−{currency(total)}</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full bg-rose-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-rose-100 bg-rose-50 px-5 py-3">
              <span className="text-sm font-bold text-rose-700">Total egresos</span>
              <span className="text-sm font-black tabular-nums text-rose-700">−{currency(expenses.total)}</span>
            </div>
          </>
        ) : (
          <p className="px-5 py-5 text-center text-sm text-ink-400">Sin egresos en este período</p>
        )}
      </Section>

      <div className={cn("overflow-hidden rounded-2xl border-2", net >= 0 ? "border-brand-200" : "border-rose-200")}>
        <div className={cn("flex items-center justify-between gap-3 px-5 py-5", net >= 0 ? "bg-brand-50" : "bg-rose-50")}>
          <div>
            <p className={cn("text-base font-black", net >= 0 ? "text-brand-800" : "text-rose-700")}>
              {net > 0 ? "Ganancia neta" : net < 0 ? "Pérdida neta" : "Balance neutro"}
            </p>
            {net < 0 ? <p className="mt-0.5 text-xs font-semibold text-rose-500">Los egresos pagados superan los ingresos del período</p> : null}
          </div>
          <span className={cn("text-2xl font-black tabular-nums", net >= 0 ? "text-brand-700" : "text-rose-600")}>
            {net < 0 ? "−" : ""}
            {currency(Math.abs(net))}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Por instructor ──────────────────────────────────────────────────────────

function ByInstructor({ report }: { report: AccountingReport }) {
  if (!report.instructors.length) {
    return <p className="rounded-2xl border border-dashed border-ink-200 bg-white px-5 py-10 text-center text-sm text-ink-500">Aún no tienes instructores.</p>;
  }

  return (
    <div className="space-y-4">
      {report.instructors.map((item) => (
        <article key={item.id} className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
          <div className="space-y-4 p-5">
            <header className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: item.color }}>
                  {item.nombre.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-ink-900">
                    {item.nombre}
                    {!item.activo ? <span className="ml-2 text-xs font-medium text-ink-400">(inactivo)</span> : null}
                  </h3>
                  <p className="text-xs text-ink-500">
                    {`${item.clases} clase${item.clases === 1 ? "" : "s"} dictada${item.clases === 1 ? "" : "s"}`} ·{" "}
                    <span className="font-medium text-amber-600">{item.forma}</span>
                  </p>
                </div>
              </div>
            </header>

            <div className="grid grid-cols-3 gap-2">
              <Tile label="Generado" value={currency(item.generado)} hint="en el período" />
              <Tile label="Pagado" value={currency(item.pagado)} hint="en el período" tone="green" />
              <Tile label="Por liquidar" value={currency(item.pendiente)} hint="a hoy" tone={item.pendiente > 0 ? "amber" : "muted"} />
            </div>
            {item.pendiente > 0 ? (
              <p className="text-[11px] font-semibold text-amber-600">Pasa a egresos solo cuando registras el pago al instructor.</p>
            ) : null}
          </div>

          {item.pagos.length ? (
            <ul className="divide-y divide-ink-50 border-t border-ink-100">
              {item.pagos.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block text-ink-700">
                      {formatDate(payment.fecha)} · {payment.tipo === "SUELDO" ? "Sueldo" : "Comisiones"}
                    </span>
                    <span className="block text-xs text-ink-400">{describeMethod(payment.metodos.length > 1 ? "MIXTO" : (payment.metodos[0]?.metodo ?? null), payment.metodos)}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-rose-600">−{currency(payment.monto)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
      <Link href="/dashboard/colaboradores/pagos" className="inline-flex text-sm font-semibold text-brand-600 hover:underline">
        Ir a Pagos de instructores →
      </Link>
    </div>
  );
}

// ─── Egresos ─────────────────────────────────────────────────────────────────

function Expenses({ report }: { report: AccountingReport }) {
  const groups = useMemo(() => {
    const map = new Map<string, AccountingReport["expenses"]["items"]>();
    for (const item of report.expenses.items) map.set(item.categoria ?? "OTHER", [...(map.get(item.categoria ?? "OTHER") ?? []), item]);
    return Array.from(map.entries()).sort((a, b) => b[1].reduce((s, x) => s + x.monto, 0) - a[1].reduce((s, x) => s + x.monto, 0));
  }, [report.expenses.items]);

  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-5 py-10 text-center text-sm text-ink-500">
        Sin egresos en este período.{" "}
        <Link href="/dashboard/egresos" className="font-semibold text-brand-600 hover:underline">
          Registrar un egreso
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([id, items]) => (
        <CategoryGroup key={id} id={id} items={items} />
      ))}
      <Link href="/dashboard/egresos" className="inline-flex text-sm font-semibold text-brand-600 hover:underline">
        Registrar o eliminar egresos en Egresos →
      </Link>
    </div>
  );
}

function CategoryGroup({ id, items }: { id: string; items: AccountingReport["expenses"]["items"] }) {
  const [open, setOpen] = useState(true);
  const meta = categoryMeta(id);
  const Icon = meta.icon;
  const total = items.reduce((sum, item) => sum + item.monto, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 bg-ink-50/60 px-4 py-3">
        <span className="flex items-center gap-2.5">
          <span className={cn("flex size-8 items-center justify-center rounded-xl", meta.tone)}>
            <Icon className="size-4" />
          </span>
          <span className="text-left">
            <span className="block text-sm font-bold text-ink-800">{meta.label}</span>
            <span className="block text-xs text-ink-400">{`${items.length} registro${items.length === 1 ? "" : "s"}`}</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-black tabular-nums text-rose-600">−{currency(total)}</span>
          {open ? <FiChevronUp className="size-4 text-ink-400" /> : <FiChevronDown className="size-4 text-ink-400" />}
        </span>
      </button>
      {open ? (
        <ul className="divide-y divide-ink-50">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{item.concepto}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                  {formatDate(item.fecha)}
                  {item.metodoPago ? <span>· {describeMethod(item.metodoPago, item.partes)}</span> : null}
                  {item.origen === "INSTRUCTOR" ? (
                    <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">Pago registrado</span>
                  ) : null}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-rose-600">−{currency(item.monto)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

const TONES = {
  green: "bg-brand-50 text-brand-600",
  red: "bg-rose-50 text-rose-600",
  orange: "bg-orange-50 text-orange-600"
} as const;

function StatCard({
  title,
  value,
  subtitle,
  icon,
  tone,
  className
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  tone: keyof typeof TONES;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-ink-100 bg-white p-4 shadow-sm sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink-600">{title}</p>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl [&>svg]:size-4", TONES[tone])}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-black tabular-nums text-ink-950 sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-ink-400">{subtitle}</p>
    </div>
  );
}

function Section({ tone, icon, title, children }: { tone: "green" | "red"; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <header
        className={cn(
          "flex items-center gap-2 border-b px-5 py-3 [&>svg]:size-4",
          tone === "green" ? "border-brand-100 bg-brand-50 text-brand-700" : "border-rose-100 bg-rose-50 text-rose-600"
        )}
      >
        {icon}
        <h2 className="text-xs font-bold uppercase tracking-widest">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Tile({ label, value, hint, tone = "default" }: { label: string; value: string; hint: string; tone?: "default" | "green" | "amber" | "muted" }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        tone === "green" && "border-brand-100 bg-brand-50",
        tone === "amber" && "border-amber-200 bg-amber-50",
        tone === "muted" && "border-ink-100 bg-ink-50",
        tone === "default" && "border-ink-100 bg-white"
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={cn("text-base font-black leading-tight tabular-nums sm:text-lg", tone === "amber" ? "text-amber-700" : tone === "green" ? "text-brand-700" : "text-ink-900")}>
        {value}
      </p>
      <p className="text-[10px] text-ink-400">{hint}</p>
    </div>
  );
}

function DateField({ label, type, value, onChange }: { label: string; type: "date" | "month"; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-500">{label}</span>
      <input
        type={type}
        defaultValue={value}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
    </label>
  );
}

/** "Ver por día": los días del mes en una fila, como la caja de CliqCut. */
function DayStrip({ month, selected, onSelect }: { month: string; selected: string; onSelect: (day: string) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const days = useMemo(() => {
    const list: string[] = [];
    for (let key = `${month}-01`; key.startsWith(month); key = addDaysToKey(key, 1)) list.push(key);
    return list;
  }, [month]);

  useEffect(() => {
    refs.current[selected]?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);

  return (
    <div className="space-y-2">
      <div className="max-w-xs">
        <DateField label="Mes" type="month" value={month} onChange={(value) => onSelect(`${value}-01`)} />
      </div>
      <ScrollHint fade="white" scrollerClassName="flex gap-2 pb-1">
        {days.map((day) => (
          <button
            key={day}
            ref={(node) => {
              refs.current[day] = node;
            }}
            type="button"
            aria-pressed={day === selected}
            onClick={() => onSelect(day)}
            className={cn(
              "flex min-h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-xs font-semibold transition-colors",
              day === selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-ink-50 text-ink-700 hover:bg-white"
            )}
          >
            <span className="text-[10px] font-medium opacity-80">{SHORT_WEEKDAYS[isoWeekday(day) - 1]}</span>
            {Number(day.slice(8))}
          </button>
        ))}
      </ScrollHint>
    </div>
  );
}
