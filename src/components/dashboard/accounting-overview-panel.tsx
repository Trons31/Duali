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
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-white px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft sm:px-6 sm:py-6">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-400">Historial</p>
              <h1 className="mt-2 text-[1.7rem] font-black tracking-tight text-ink-950 sm:text-[2rem]">
                {data.period.monthLabel}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-ink-500">
                Revisa ingresos, egresos, metodos de pago y movimientos del mes seleccionado.
              </p>
            </div>

            <label className="relative block max-w-[260px]">
              <FiCalendar className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input
                type="month"
                value={monthInputValue}
                onChange={(event) => handleMonthInput(event.target.value)}
                className="field-base h-11 w-full rounded-[18px] pl-11 pr-4 text-[14px]"
              />
            </label>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:gap-4">
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

        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft sm:px-6 sm:py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[1.5rem] font-black tracking-tight text-ink-950 sm:text-[1.7rem]">Metodos de pago</h2>
              <p className="mt-2 text-sm text-ink-500">Distribucion del dinero cobrado entre mensualidades e inscripciones.</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-[18px] bg-brand-50 text-brand-600">
              <FiCreditCard className="size-5" />
            </div>
          </div>

          {data.paymentMethods.length ? (
            <div className="mt-6 space-y-5">
              {data.paymentMethods.map((method) => (
                <div key={method.method} className="space-y-2.5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[15px] font-bold text-ink-950">{method.method}</p>
                      <p className="mt-1 text-sm font-semibold text-ink-400">
                        {method.count} {method.count === 1 ? "cobro" : "cobros"} · {method.percentage}%
                      </p>
                    </div>
                    <p className="text-[1.45rem] font-black tracking-tight text-brand-600">{currency(method.amount)}</p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-brand-50">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(method.percentage, 6)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink-200 bg-ink-50 px-5 py-10 text-center">
              <p className="text-base font-bold text-ink-900">Aun no hay ingresos en este mes</p>
              <p className="mt-2 text-sm text-ink-500">Cuando registres cobros pagados, aqui veras su distribucion por metodo.</p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4 px-1">
            <div>
              <h2 className="text-[1.7rem] font-black tracking-tight text-ink-950 sm:text-[1.9rem]">Movimientos</h2>
              <p className="mt-1 text-sm font-semibold text-ink-400">
                {data.summary.movimientos} {data.summary.movimientos === 1 ? "registro" : "registros"}
              </p>
            </div>
          </div>

          {groupedMovements.length ? (
            groupedMovements.map((group) => {
              const isClosed = Boolean(closedDays[group.key]);

              return (
                <section key={group.key} className="rounded-[28px] border border-ink-100 bg-white shadow-soft">
                  <div className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
                    <div>
                      <h3 className="text-[1.25rem] font-black tracking-tight text-ink-950 sm:text-[1.4rem]">{group.title}</h3>
                      <p className="mt-1 text-sm font-semibold text-ink-400">
                        {group.count} {group.count === 1 ? "movimiento" : "movimientos"} · {currency(group.totalAmount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleDay(group.key)}
                      className="rounded-full p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                      aria-label={isClosed ? "Mostrar movimientos del dia" : "Ocultar movimientos del dia"}
                    >
                      {isClosed ? <FiChevronDown className="size-6" /> : <FiChevronUp className="size-6" />}
                    </button>
                  </div>

                  {isClosed ? null : (
                    <div className="grid gap-4 border-t border-ink-100 px-4 py-4 sm:px-6 sm:py-6">
                      {group.items.map((movement) => (
                        <MovementCard key={`${group.key}-${movement.type}-${movement.id}`} movement={movement} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          ) : (
            <section className="rounded-[28px] border border-ink-100 bg-white px-6 py-16 text-center shadow-soft">
              <div className="mx-auto flex size-20 items-center justify-center rounded-[28px] bg-ink-50 text-ink-300">
                <FiCalendar className="size-8" />
              </div>
              <h2 className="mt-6 text-[1.75rem] font-black tracking-tight text-ink-950">Sin movimientos ese mes</h2>
              <p className="mt-2 text-sm text-ink-500">Prueba con otro mes o registra cobros y egresos para ver actividad aqui.</p>
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
      card: "bg-emerald-50",
      value: "text-brand-600",
      icon: "text-brand-600"
    },
    warning: {
      card: "bg-amber-50",
      value: "text-amber-600",
      icon: "text-amber-500"
    },
    violet: {
      card: "bg-violet-50",
      value: "text-violet-600",
      icon: "text-violet-500"
    },
    blue: {
      card: "bg-sky-50",
      value: "text-sky-600",
      icon: "text-sky-500"
    }
  }[tone];

  return (
    <article className={cn("rounded-[28px] border border-ink-100 px-4 py-4 shadow-soft sm:px-5 sm:py-5", toneStyles.card)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold leading-none text-ink-500 sm:text-[12px]">{title}</p>
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-[14px] bg-white/75 sm:size-9", toneStyles.icon)}>
          {icon}
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <p
          className={cn(
            "truncate text-[1.2rem] font-black tracking-tight leading-none sm:text-[1.55rem]",
            toneStyles.value
          )}
        >
          {value}
        </p>
        <p className="mt-2 text-[11px] font-semibold leading-snug text-ink-500 sm:text-[12px]">{caption}</p>
      </div>
    </article>
  );
}

function MovementCard({ movement }: { movement: AccountingMovement }) {
  const isIncome = movement.direction === "income";

  return (
    <article className="rounded-[24px] border border-ink-100 bg-white px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)] sm:px-5">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-[20px]",
            isIncome ? "bg-brand-50 text-brand-600" : "bg-rose-50 text-rose-600"
          )}
        >
          {isIncome ? <FiArrowDownRight className="size-6" /> : <FiArrowUpRight className="size-6" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[14px] font-bold leading-tight text-ink-950 sm:text-[15px]">{movement.title}</h3>
              <p className="mt-1 text-[12px] font-semibold leading-snug text-ink-500 sm:text-[13px]">{movement.subtitle}</p>
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
                  "text-[1.05rem] font-black tracking-tight leading-none sm:text-[1.45rem]",
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
