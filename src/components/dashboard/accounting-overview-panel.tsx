"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  FiArrowDownRight,
  FiArrowUpRight,
  FiCalendar,
  FiChevronDown,
  FiChevronUp,
  FiCreditCard,
  FiDollarSign,
  FiFilter,
  FiLayers,
  FiTrendingDown,
  FiTrendingUp
} from "react-icons/fi";
import { cn, currency } from "@/lib/web-utils";
import type { AccountingMovement, AccountingOverview } from "@/lib/web-types";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

export function AccountingOverviewPanel({ data }: { data: AccountingOverview }) {
  const router = useRouter();
  const pathname = usePathname();
  const [closedDays, setClosedDays] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const groupedMovements = useMemo(() => groupMovementsByDay(data.movements), [data.movements]);

  function updatePeriod(year: number, month: number) {
    const params = new URLSearchParams();
    params.set("year", String(year));
    params.set("month", String(month));
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleMonthInput(value: string) {
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return;
    updatePeriod(year, month);
  }

  function toggleDay(key: string) {
    setClosedDays((current) => ({ ...current, [key]: !current[key] }));
  }

  const monthInputValue = `${data.period.year}-${String(data.period.month).padStart(2, "0")}`;

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex min-w-0 items-start gap-3 px-1">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <FiTrendingUp className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-700">Finanzas</p>
            <h1 className="mt-1 text-[1.75rem] font-black leading-none text-ink-950 sm:text-[2rem]">Contabilidad</h1>
            <p className="mt-2 hidden text-sm leading-5 text-ink-500 sm:block">
              Consulta el balance y los movimientos de tu negocio.
            </p>
          </div>
        </header>

        <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink-500">Periodo seleccionado</p>
              <p className="mt-1 text-base font-black text-ink-950 sm:text-lg">{data.period.monthLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition focus:outline-none focus:ring-4 focus:ring-brand-100",
                filtersOpen
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
              )}
              aria-expanded={filtersOpen}
              aria-controls="accounting-filters"
            >
              <FiFilter className="size-4" />
              <span className="hidden min-[360px]:inline">Filtros</span>
              <FiChevronDown className={cn("size-3.5 transition", filtersOpen && "rotate-180")} />
            </button>
          </div>

          {filtersOpen ? (
            <div id="accounting-filters" className="mt-4 border-t border-ink-100 pt-4">
              <label className="block max-w-xs">
                <span className="mb-2 block text-xs font-bold text-ink-600">Mes</span>
                <span className="relative block">
                  <FiCalendar className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                  <input
                    type="month"
                    value={monthInputValue}
                    onChange={(event) => handleMonthInput(event.target.value)}
                    className="field-base h-11 w-full rounded-xl py-2 pl-10 pr-3 text-sm"
                  />
                </span>
              </label>
            </div>
          ) : null}
        </section>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <SummaryCard
            title="Ingresos"
            value={currency(data.summary.ingresos)}
            caption={`${data.paymentMethods.reduce((sum, method) => sum + method.count, 0)} cobros del mes`}
            icon={<FiTrendingUp className="size-5" />}
            tone="success"
          />
          <SummaryCard
            title="Egresos"
            value={currency(data.summary.egresos)}
            caption={`${data.movements.filter((movement) => movement.direction === "expense").length} gastos del mes`}
            icon={<FiTrendingDown className="size-5" />}
            tone="warning"
          />
          <SummaryCard
            title="Balance"
            value={currency(data.summary.balance)}
            caption="ingresos - egresos"
            icon={<FiDollarSign className="size-5" />}
            tone="violet"
          />
          <SummaryCard
            title="Movimientos"
            value={String(data.summary.movimientos)}
            caption="registros del periodo"
            icon={<FiLayers className="size-5" />}
            tone="blue"
          />
        </section>

        <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-ink-950">Métodos de pago</h2>
              <p className="mt-1 text-sm leading-5 text-ink-500">Distribución de los ingresos del periodo.</p>
            </div>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <FiCreditCard className="size-4" />
            </div>
          </div>

          {data.paymentMethods.length ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {data.paymentMethods.map((method) => (
                <div key={method.method} className="space-y-2.5 rounded-2xl border border-ink-100 p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink-950">{method.method}</p>
                      <p className="mt-1 text-sm font-semibold text-ink-400">
                        {method.count} {method.count === 1 ? "cobro" : "cobros"} · {method.percentage}%
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-black text-brand-600">{currency(method.amount)}</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-50">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(method.percentage, 6)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-5 py-8 text-center">
              <p className="text-sm font-bold text-ink-900">Aún no hay ingresos en este mes</p>
              <p className="mt-2 text-sm text-ink-500">Los cobros registrados aparecerán distribuidos por método.</p>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-4 px-1 py-1">
            <div>
              <h2 className="text-lg font-black text-ink-950">Movimientos</h2>
              <p className="mt-1 text-sm font-semibold text-ink-400">
                {data.summary.movimientos} {data.summary.movimientos === 1 ? "registro" : "registros"}
              </p>
            </div>
          </div>

          {groupedMovements.length ? (
            groupedMovements.map((group) => {
              const isClosed = Boolean(closedDays[group.key]);

              return (
                <section key={group.key} className="rounded-[24px] border border-ink-100 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
                    <div>
                      <h3 className="text-base font-black text-ink-950 sm:text-lg">{group.title}</h3>
                      <p className="mt-1 text-sm font-semibold text-ink-400">
                        {group.count} {group.count === 1 ? "movimiento" : "movimientos"} · {currency(group.totalAmount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleDay(group.key)}
                      className="rounded-xl p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                      aria-label={isClosed ? "Mostrar movimientos del dia" : "Ocultar movimientos del dia"}
                    >
                      {isClosed ? <FiChevronDown className="size-5" /> : <FiChevronUp className="size-5" />}
                    </button>
                  </div>

                  {isClosed ? null : (
                    <div className="grid gap-3 border-t border-ink-100 p-4 sm:gap-4 sm:p-6 lg:grid-cols-2">
                      {group.items.map((movement) => (
                        <MovementCard key={`${group.key}-${movement.type}-${movement.id}`} movement={movement} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          ) : (
            <section className="rounded-[24px] border border-ink-100 bg-white px-6 py-12 text-center shadow-sm">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-300">
                <FiCalendar className="size-5" />
              </div>
              <h2 className="mt-4 text-base font-black text-ink-950">Sin movimientos ese mes</h2>
              <p className="mt-2 text-sm text-ink-500">Prueba con otro mes o registra cobros y egresos.</p>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  caption,
  icon,
  tone
}: {
  title: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
  tone: "success" | "warning" | "violet" | "blue";
}) {
  const toneStyles = {
    success: {
      value: "text-emerald-700",
      icon: "bg-emerald-50 text-emerald-600"
    },
    warning: {
      value: "text-amber-500",
      icon: "bg-amber-50 text-amber-500"
    },
    violet: {
      value: "text-violet-600",
      icon: "bg-violet-50 text-violet-600"
    },
    blue: {
      value: "text-blue-600",
      icon: "bg-blue-50 text-blue-600"
    }
  }[tone];

  return (
    <article className="flex h-[152px] min-w-0 flex-col rounded-2xl border border-ink-100 bg-white p-3 shadow-sm transition hover:shadow-md sm:h-auto sm:rounded-[24px] sm:p-6">
      <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-start gap-2 sm:flex sm:gap-4">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-12 sm:rounded-2xl", toneStyles.icon)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="min-h-8 text-[11px] font-bold leading-4 text-ink-500 sm:min-h-0 sm:text-sm">{title}</p>
          <p className={cn("mt-1.5 break-words text-lg font-black leading-none sm:mt-3 sm:text-2xl", toneStyles.value)}>
            {value}
          </p>
        </div>
      </div>

      <p className="mt-auto min-w-0 pt-3 text-[11px] font-medium leading-4 text-ink-500 sm:truncate sm:pt-8 sm:text-sm">
        {caption}
      </p>
    </article>
  );
}

function MovementCard({ movement }: { movement: AccountingMovement }) {
  const isIncome = movement.direction === "income";

  return (
    <article className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            isIncome ? "bg-brand-50 text-brand-600" : "bg-rose-50 text-rose-600"
          )}
        >
          {isIncome ? <FiArrowDownRight className="size-4" /> : <FiArrowUpRight className="size-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold leading-tight text-ink-950">{movement.title}</h3>
              <p className="mt-1 text-xs font-semibold leading-snug text-ink-500 sm:text-[13px]">{movement.subtitle}</p>
              {movement.type === "ABONO" ? (
                <p className="mt-2 text-[12px] font-bold text-sky-700">
                  Abono: {currency(movement.amount)} · Quedo debiendo: {currency(movement.remainingBalance ?? 0)}
                </p>
              ) : null}
              <p className="mt-2 text-[12px] font-semibold text-ink-400">{formatMovementDate(movement.date)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={cn(
                  "text-base font-black leading-none sm:text-xl",
                  isIncome ? "text-brand-600" : "text-rose-600"
                )}
              >
                {isIncome ? currency(movement.amount) : `-${currency(movement.amount)}`}
              </p>
              <p
                className={cn(
                  "mt-2 text-[10px] font-bold uppercase tracking-[0.14em] sm:text-[11px]",
                  isIncome ? "text-brand-600" : "text-rose-600"
                )}
              >
                {movement.type}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function groupMovementsByDay(movements: AccountingMovement[]) {
  const map = new Map<
    string,
    {
      key: string;
      title: string;
      count: number;
      totalAmount: number;
      date: Date;
      items: AccountingMovement[];
    }
  >();

  for (const movement of movements) {
    const date = new Date(movement.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const signedAmount = movement.direction === "income" ? movement.amount : -movement.amount;

    if (!map.has(key)) {
      map.set(key, {
        key,
        title: `${date.getDate()} de ${MONTH_NAMES[date.getMonth()].toLowerCase()} de ${date.getFullYear()}`,
        count: 0,
        totalAmount: 0,
        date,
        items: []
      });
    }

    const bucket = map.get(key)!;
    bucket.count += 1;
    bucket.totalAmount += signedAmount;
    bucket.items.push(movement);
  }

  return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

function formatMovementDate(value: string) {
  const date = new Date(value);
  return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()].toLowerCase()}`;
}
