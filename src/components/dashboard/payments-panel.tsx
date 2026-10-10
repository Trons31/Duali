"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiChevronRight, FiCreditCard, FiSearch } from "react-icons/fi";
import { EmptyCard } from "@/components/dashboard/studio-ui";
import { memberName } from "@/components/dashboard/studio-sales-ui";
import { PAYMENT_METHODS } from "@/components/ui/payment-method-modal";
import { addDaysToKey, dateKeyToDate, studioNow } from "@/lib/studio-time";
import { cn, currency } from "@/lib/web-utils";
import type { MemberPackageSaleItem } from "@/lib/web-types";

const methodLabel = (value: string) => PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;

type PaymentRow = {
  id: string;
  monto: number;
  metodoPago: string;
  dia: string;
  anulado: boolean;
  /** "abono 2 de 2" cuando la venta tuvo mas de un pago valido. */
  abono: string | null;
  sale: MemberPackageSaleItem;
};

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateKeyToDate(`${month}-01`));
}

function dayLabel(day: string, today: string) {
  if (day === today) return "Hoy";
  if (day === addDaysToKey(today, -1)) return "Ayer";
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(dateKeyToDate(day));
}

/** Los abonos de todas las ventas, con su numero dentro de la venta (spec 020 R5/R6). */
export function paymentRows(sales: MemberPackageSaleItem[]): PaymentRow[] {
  return sales
    .flatMap((sale) => {
      const valid = sale.payments.filter((payment) => !payment.anuladoAt);
      return sale.payments.map((payment) => {
        // payments viene del mas reciente al mas antiguo.
        const position = valid.length - valid.findIndex((entry) => entry.id === payment.id);
        return {
          id: payment.id,
          monto: payment.monto,
          metodoPago: payment.metodoPago,
          dia: studioNow(new Date(payment.fecha)).dateKey,
          anulado: Boolean(payment.anuladoAt) || sale.estado === "ANULADO",
          abono: !payment.anuladoAt && valid.length > 1 ? `abono ${position} de ${valid.length}` : null,
          sale
        };
      });
    })
    .sort((a, b) => b.dia.localeCompare(a.dia));
}

/** Spec 020 D3/R5: Clientes › Pagos, todos los pagos del estudio. */
export function PaymentsPanel({ sales, today }: { sales: MemberPackageSaleItem[]; today: string }) {
  const month = today.slice(0, 7);
  const rows = useMemo(() => paymentRows(sales), [sales]);
  const months = useMemo(() => Array.from(new Set([month, ...rows.map((row) => row.dia.slice(0, 7))])).sort().reverse(), [rows, month]);
  const [period, setPeriod] = useState(month);
  const [method, setMethod] = useState("TODOS");
  const [query, setQuery] = useState("");

  const totals = useMemo(() => {
    const valid = sales.filter((sale) => sale.estado !== "ANULADO");
    return {
      cobradoMes: rows.filter((row) => !row.anulado && row.dia.startsWith(month)).reduce((sum, row) => sum + row.monto, 0),
      porCobrar: valid.reduce((sum, sale) => sum + sale.saldo, 0),
      saldosVencidos: valid.filter((sale) => sale.saldoVencido).length
    };
  }, [rows, sales, month]);

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("es");
    return rows.filter(
      (row) =>
        (period === "TODO" || row.dia.startsWith(period)) &&
        (method === "TODOS" || row.metodoPago === method) &&
        (!text || `${memberName(row.sale.member)} ${row.sale.nombre} ${row.sale.discipline.nombre}`.toLocaleLowerCase("es").includes(text))
    );
  }, [rows, period, method, query]);

  const groups = useMemo(() => {
    const byDay = new Map<string, PaymentRow[]>();
    for (const row of visible) byDay.set(row.dia, [...(byDay.get(row.dia) ?? []), row]);
    return Array.from(byDay.entries());
  }, [visible]);

  const periodTotal = visible.filter((row) => !row.anulado).reduce((sum, row) => sum + row.monto, 0);
  const selectClass =
    "rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Pagos</h1>
        <p className="mt-1 text-sm text-ink-500">Todo lo que te han pagado por planes y clases sueltas</p>
      </div>

      {rows.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Cobrado este mes" value={currency(totals.cobradoMes)} />
            <Stat label="Por cobrar" value={currency(totals.porCobrar)} tone={totals.porCobrar > 0 ? "danger" : "default"} />
            <Stat
              className="col-span-2 sm:col-span-1"
              label="Saldos vencidos"
              value={String(totals.saldosVencidos)}
              tone={totals.saldosVencidos > 0 ? "danger" : "default"}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-3 shadow-sm sm:p-4">
            <label className="relative block">
              <span className="sr-only">Buscar pagos</span>
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente o plan"
                className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-700 placeholder:text-ink-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Mes" value={period} onChange={(event) => setPeriod(event.target.value)} className={cn(selectClass, "capitalize")}>
                {months.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry === month ? "Este mes" : monthLabel(entry)}
                  </option>
                ))}
                <option value="TODO">Todos los meses</option>
              </select>
              <select aria-label="Método" value={method} onChange={(event) => setMethod(event.target.value)} className={selectClass}>
                <option value="TODOS">Todos los métodos</option>
                {PAYMENT_METHODS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <span className="ml-auto text-sm text-ink-500">
                Total <span className="font-semibold text-ink-800">{currency(periodTotal)}</span>
              </span>
            </div>
          </div>

          {groups.length ? (
            <div className="space-y-4">
              {groups.map(([day, items]) => (
                <section key={day} className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400 first-letter:uppercase">{dayLabel(day, today)}</h2>
                  <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white shadow-sm">
                    {items.map((row) => (
                      <li key={row.id}>
                        <Link
                          href={`/dashboard/clientes/${row.sale.member.id}`}
                          className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-ink-50/60"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink-800">
                              {memberName(row.sale.member)} ·{" "}
                              <span className="font-normal text-ink-600">
                                {row.sale.claseSuelta ? `Clase suelta ${row.sale.discipline.nombre}` : `${row.sale.nombre} ${row.sale.discipline.nombre}`}
                              </span>
                            </span>
                            <span className={cn("block truncate text-xs text-ink-500", row.anulado && "line-through")}>
                              {methodLabel(row.metodoPago)}
                              {row.abono ? ` · ${row.abono}` : ""}
                            </span>
                            {row.anulado ? (
                              <span className="block text-[11px] text-ink-400">
                                {row.sale.estado === "ANULADO" ? "Venta anulada" : "Pago anulado"}: no cuenta como ingreso
                              </span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className={cn("text-sm font-bold text-ink-900", row.anulado && "font-medium text-ink-400 line-through")}>
                              {currency(row.monto)}
                            </span>
                            <FiChevronRight className="size-4 text-ink-300" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-500">No hay pagos con ese filtro.</p>
          )}
        </>
      ) : (
        <EmptyCard
          title="Aún no hay pagos"
          description="Los pagos que registres al vender, en la ficha de cada cliente o al aprobar un comprobante aparecen aquí."
          action={
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-500">
              <FiCreditCard className="size-4" />
              Clientes › ficha › Registrar pago
            </span>
          }
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone = "default", className }: { label: string; value: string; tone?: "default" | "danger"; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-ink-200 bg-white p-4 shadow-sm", className)}>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone === "danger" ? "text-rose-600" : "text-ink-900")}>{value}</p>
    </div>
  );
}
