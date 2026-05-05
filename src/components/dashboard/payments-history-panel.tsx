"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import { cn, currency } from "@/lib/web-utils";
import type { PaymentHistoryFilter, PaymentHistoryResponse } from "@/lib/web-types";

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];

export function PaymentsHistoryPanel({ data }: { data: PaymentHistoryResponse }) {
  const router = useRouter();
  const pathname = usePathname();
  const [closedDays, setClosedDays] = useState<Record<string, boolean>>({});

  const groupedByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        date: Date;
        title: string;
        count: number;
        totalAmount: number;
        items: PaymentHistoryResponse["items"];
      }
    >();

    for (const item of data.items) {
      const date = new Date(item.fechaPago);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          date,
          title: formatSectionDate(date),
          count: 0,
          totalAmount: 0,
          items: []
        });
      }

      const bucket = map.get(key)!;
      bucket.count += 1;
      bucket.totalAmount += Number(item.monto);
      bucket.items.push(item);
    }

    return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [data.items]);

  function updateFilters(params: { period?: PaymentHistoryFilter; month?: string }) {
    const search = new URLSearchParams();
    const nextPeriod = params.period ?? data.filters.period;
    const nextMonth = params.month ?? data.filters.month;

    search.set("period", nextPeriod);
    if (nextMonth) search.set("month", nextMonth);

    router.replace(`${pathname}?${search.toString()}`);
  }

  function toggleDay(key: string) {
    setClosedDays((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-white px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft sm:px-6 sm:py-6">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-400">Historial</p>
              <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-ink-950 sm:text-[2.2rem]">Pagados con exito</h1>
              <p className="mt-2 text-sm text-ink-500">
                {data.summary.totalCount} cobros · {currency(data.summary.totalAmount)}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateFilters({ period: "week" })}
                  className={cn(
                    "rounded-[16px] border px-4 py-2 text-[13px] font-semibold transition",
                    data.filters.period === "week"
                      ? "border-ink-950 bg-ink-950 text-white"
                      : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                  )}
                >
                  Esta semana
                </button>
                <button
                  type="button"
                  onClick={() => updateFilters({ period: "month" })}
                  className={cn(
                    "rounded-[16px] border px-4 py-2 text-[13px] font-semibold transition",
                    data.filters.period === "month"
                      ? "border-ink-950 bg-ink-950 text-white"
                      : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                  )}
                >
                  Por mes
                </button>
              </div>

              <label className="block space-y-2">
                <span className="block text-sm font-black text-ink-900">Mes</span>
                <input
                  type="month"
                  value={data.filters.month}
                  onChange={(event) => updateFilters({ period: "month", month: event.target.value })}
                  className="field-base h-11 rounded-[18px] text-[14px]"
                />
              </label>
            </div>
          </div>
        </section>

        {groupedByDay.length === 0 ? (
          <section className="rounded-[28px] border border-ink-100 bg-white px-6 py-14 text-center shadow-soft">
            <h2 className="text-lg font-bold text-ink-950">No hay pagos registrados</h2>
            <p className="mt-2 text-sm text-ink-500">Prueba con otra semana o selecciona un mes distinto.</p>
          </section>
        ) : (
          groupedByDay.map((group) => {
            const isClosed = Boolean(closedDays[group.key]);

            return (
              <section key={group.key} className="rounded-[28px] border border-ink-100 bg-white shadow-soft">
                <div className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="text-[1.45rem] font-black tracking-tight text-ink-950">{group.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-ink-400">
                      {group.count} {group.count === 1 ? "registro" : "registros"} · {currency(group.totalAmount)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDay(group.key)}
                    className="rounded-full p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                    aria-label={isClosed ? "Mostrar pagos del dia" : "Ocultar pagos del dia"}
                  >
                    {isClosed ? <FiChevronDown className="size-6" /> : <FiChevronUp className="size-6" />}
                  </button>
                </div>

                {isClosed ? null : (
                  <div className="grid gap-4 border-t border-ink-100 px-4 py-4 sm:px-6 sm:py-6">
                    {group.items.map((item) => (
                      <article
                        key={`${group.key}-${item.kind}-${item.id}`}
                        className="rounded-[24px] border border-ink-100 bg-white px-5 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[15px] font-semibold text-ink-950">
                              {item.student.nombre} {item.student.apellido}
                            </p>
                            <p className="mt-1 text-sm text-ink-500">
                              {item.label}
                              {item.kind === "MONTHLY_PAYMENT" && item.mes && item.anio
                                ? ` · ${formatMonthYear(item.mes, item.anio)}`
                                : ""}
                              {item.group?.nombre ? ` · ${item.group.nombre}` : ""}
                            </p>
                          </div>
                          <p className="shrink-0 text-[1.8rem] font-black tracking-tight text-brand-600">{currency(item.monto)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatSectionDate(date: Date) {
  return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatMonthYear(month: number, year: number) {
  return `${MONTH_NAMES[month - 1] ?? month}/${year}`;
}
