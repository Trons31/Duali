"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FiChevronDown, FiChevronRight, FiChevronUp, FiDollarSign, FiFilter, FiX } from "react-icons/fi";
import { Modal } from "@/components/ui/modal";
import { cn, currency } from "@/lib/web-utils";
import type { PaymentHistoryFilter, PaymentHistoryItem, PaymentHistoryResponse } from "@/lib/web-types";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<PaymentHistoryItem | null>(null);

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
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex min-w-0 items-start gap-3 px-1">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <FiDollarSign className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-700">Historial</p>
            <h1 className="mt-1 text-[1.75rem] font-black leading-none text-ink-950 sm:text-[2rem]">Pagados con éxito</h1>
            <p className="mt-2 text-sm leading-5 text-ink-500">Consulta los ingresos registrados por fecha.</p>
          </div>
        </header>

        <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-500">
                {data.filters.period === "week" ? "Esta semana" : "Periodo mensual"}
              </p>
              <p className="mt-1 text-base font-black text-ink-950 sm:text-lg">
                {data.summary.totalCount} cobros · {currency(data.summary.totalAmount)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition focus:outline-none focus:ring-4 focus:ring-brand-100",
                filtersOpen || data.filters.period === "week"
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
              )}
              aria-expanded={filtersOpen}
              aria-controls="payment-history-filters"
            >
              <FiFilter className="size-4" />
              <span className="hidden min-[360px]:inline">Filtros</span>
              {data.filters.period === "week" ? <span className="size-2 rounded-full bg-brand-600" /> : null}
              <FiChevronDown className={cn("size-3.5 transition", filtersOpen && "rotate-180")} />
            </button>
          </div>

          {filtersOpen ? (
            <div id="payment-history-filters" className="mt-4 border-t border-ink-100 pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-ink-800">Periodo</p>
                {data.filters.period === "week" ? (
                  <button
                    type="button"
                    onClick={() => updateFilters({ period: "month", month: "" })}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-500 transition hover:text-brand-700"
                  >
                    <FiX className="size-4" />
                    Limpiar
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { value: "week" as const, label: "Esta semana" },
                  { value: "month" as const, label: "Por mes" }
                ].map((option) => {
                  const active = data.filters.period === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateFilters({ period: option.value })}
                      className={cn(
                        "min-h-10 rounded-xl border px-3 text-xs font-semibold transition sm:text-sm",
                        active
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-ink-200 bg-white text-ink-700 hover:border-brand-200 hover:bg-brand-50"
                      )}
                      aria-pressed={active}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {data.filters.period === "month" ? (
                <label className="mt-3 block max-w-xs">
                  <span className="mb-2 block text-xs font-bold text-ink-600">Mes</span>
                  <input
                    type="month"
                    value={data.filters.month}
                    onChange={(event) => updateFilters({ period: "month", month: event.target.value })}
                    className="field-base h-11 rounded-xl py-2 text-sm"
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </section>

        {groupedByDay.length === 0 ? (
          <section className="rounded-[24px] border border-ink-100 bg-white px-6 py-12 text-center shadow-sm">
            <h2 className="text-base font-black text-ink-950">No hay pagos registrados</h2>
            <p className="mt-2 text-sm text-ink-500">Prueba con otra semana o selecciona un mes distinto.</p>
          </section>
        ) : (
          groupedByDay.map((group) => {
            const isClosed = Boolean(closedDays[group.key]);

            return (
              <section key={group.key} className="rounded-[24px] border border-ink-100 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="text-lg font-black text-ink-950">{group.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-ink-400">
                      {group.count} {group.count === 1 ? "registro" : "registros"} · {currency(group.totalAmount)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDay(group.key)}
                    className="rounded-xl p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                    aria-label={isClosed ? "Mostrar pagos del dia" : "Ocultar pagos del dia"}
                  >
                    {isClosed ? <FiChevronDown className="size-5" /> : <FiChevronUp className="size-5" />}
                  </button>
                </div>

                {isClosed ? null : (
                  <div className="grid gap-3 border-t border-ink-100 p-4 sm:gap-4 sm:p-6 lg:grid-cols-2">
                    {group.items.map((item) => (
                      <article
                        key={`${group.key}-${item.kind}-${item.id}`}
                        className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition hover:shadow-md"
                      >
                        <button
                          type="button"
                          onClick={() => setDetailItem(item)}
                          className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset"
                          aria-label={`Ver detalle del pago de ${item.student.nombre} ${item.student.apellido}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold text-ink-950">
                              {item.student.nombre} {item.student.apellido}
                            </p>
                            <p className="mt-1 truncate text-xs font-medium text-ink-500">
                              {item.label}
                              {item.group?.nombre ? ` · ${item.group.nombre}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <p
                              className={cn(
                                "text-lg font-black leading-none",
                                item.kind === "PAYMENT_INSTALLMENT" ? "text-sky-700" : "text-brand-600"
                              )}
                            >
                              {currency(item.monto)}
                            </p>
                            <FiChevronRight className="size-5 text-ink-300" />
                          </div>
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      <Modal
        open={Boolean(detailItem)}
        title={detailItem ? `${detailItem.student.nombre} ${detailItem.student.apellido}` : ""}
        description={detailItem ? `${detailItem.label} registrada` : undefined}
        onClose={() => setDetailItem(null)}
      >
        {detailItem ? (
          <div className="space-y-4">
            <div className="rounded-[18px] border border-ink-100 bg-ink-50/60 px-4 py-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Valor pagado</p>
              <p
                className={cn(
                  "mt-1 text-3xl font-black leading-none",
                  detailItem.kind === "PAYMENT_INSTALLMENT" ? "text-sky-700" : "text-brand-600"
                )}
              >
                {currency(detailItem.monto)}
              </p>
            </div>

            <dl className="overflow-hidden rounded-[18px] border border-ink-100">
              <DetailRow label="Concepto" value={detailItem.label} />
              {detailItem.kind === "MONTHLY_PAYMENT" && detailItem.mes && detailItem.anio ? (
                <DetailRow label="Periodo" value={formatMonthYear(detailItem.mes, detailItem.anio)} />
              ) : null}
              {detailItem.concept ? <DetailRow label="Detalle" value={detailItem.concept} /> : null}
              <DetailRow label="Grupo" value={detailItem.group?.nombre ?? "Sin grupo"} />
              <DetailRow label="Fecha de pago" value={formatFullDate(detailItem.fechaPago)} />
              {detailItem.paymentMethod ? (
                <DetailRow label="Metodo" value={formatMethod(detailItem.paymentMethod)} />
              ) : null}
              {detailItem.kind === "PAYMENT_INSTALLMENT" ? (
                <DetailRow label="Quedo debiendo" value={currency(detailItem.remainingBalance ?? 0)} />
              ) : null}
            </dl>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-4 py-3 last:border-b-0">
      <dt className="text-sm font-medium text-ink-500">{label}</dt>
      <dd className="text-right text-sm font-bold text-ink-950">{value}</dd>
    </div>
  );
}

function formatFullDate(value: string) {
  const date = new Date(value);
  return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatSectionDate(date: Date) {
  return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatMonthYear(month: number, year: number) {
  return `${MONTH_NAMES[month - 1] ?? month}/${year}`;
}

function formatMethod(method: string) {
  const upper = method.toUpperCase();
  if (upper === "EFECTIVO") return "Efectivo";
  if (upper === "TRANSFERENCIA") return "Transferencia";
  if (upper === "NEQUI") return "Nequi";
  if (upper === "DAVIPLATA") return "Daviplata";
  return method;
}
