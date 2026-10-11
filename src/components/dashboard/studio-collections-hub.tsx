"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiAlertCircle, FiCheckCircle, FiClock, FiFileText, FiList, FiSearch } from "react-icons/fi";
import { PaymentsPanel } from "@/components/dashboard/payments-panel";
import { ReceiptReviewList } from "@/components/dashboard/receipt-review-list";
import { RegisterPaymentModal, formatDateKeyShort, memberName } from "@/components/dashboard/studio-sales-ui";
import { ColorDot } from "@/components/dashboard/studio-ui";
import { ScrollHint } from "@/components/shared/scroll-hint";
import { Button } from "@/components/ui/button";
import type { ReceiptView } from "@/lib/receipts";
import { cn, currency } from "@/lib/web-utils";
import type { MemberPackageSaleItem } from "@/lib/web-types";

export type CollectionsTab = "pendientes" | "vencidos" | "revisar" | "historial";

/**
 * Spec 027 D5: Ventas › Cobros. En una sola página, como Cobros de la academia:
 * lo que falta por cobrar, lo que ya pasó su plazo, los comprobantes por revisar
 * y el historial de pagos. Desde cada fila se registra el pago (paso a paso).
 */
export function StudioCollectionsHub({
  initialTab,
  sales,
  receipts,
  today
}: {
  initialTab: CollectionsTab;
  sales: MemberPackageSaleItem[];
  receipts: ReceiptView[];
  today: string;
}) {
  const [tab, setTab] = useState<CollectionsTab>(initialTab);
  const [paying, setPaying] = useState<MemberPackageSaleItem | null>(null);
  const [query, setQuery] = useState("");

  const owing = useMemo(
    () =>
      sales
        .filter((sale) => sale.estado !== "ANULADO" && sale.saldo > 0)
        // Primero lo más atrasado; luego lo que vence antes.
        .sort((a, b) => b.diasAtrasoSaldo - a.diasAtrasoSaldo || (a.fechaLimitePago ?? "").localeCompare(b.fechaLimitePago ?? "")),
    [sales]
  );
  const overdue = owing.filter((sale) => sale.saldoVencido);
  const month = today.slice(0, 7);
  const collectedThisMonth = sales
    .filter((sale) => sale.estado !== "ANULADO")
    .flatMap((sale) => sale.payments)
    .filter((payment) => !payment.anuladoAt && payment.fecha.slice(0, 7) === month)
    .reduce((sum, payment) => sum + payment.monto, 0);

  const tabs = [
    { value: "pendientes", label: "Pendientes", icon: FiClock, count: owing.length },
    { value: "vencidos", label: "Vencidos", icon: FiAlertCircle, count: overdue.length },
    { value: "revisar", label: "Por revisar", icon: FiFileText, count: receipts.length },
    { value: "historial", label: "Historial", icon: FiList, count: null }
  ] as const;

  function select(value: CollectionsTab) {
    setTab(value);
    const url = new URL(window.location.href);
    if (value === "pendientes") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }

  const text = query.trim().toLocaleLowerCase("es");
  const filter = (list: MemberPackageSaleItem[]) =>
    text ? list.filter((sale) => `${memberName(sale.member)} ${sale.nombre} ${sale.discipline.nombre}`.toLocaleLowerCase("es").includes(text)) : list;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Cobros</h1>
        <p className="mt-1 text-sm text-ink-500">Lo que te deben, lo que está por revisar y lo que ya te pagaron.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Por cobrar" value={currency(owing.reduce((sum, sale) => sum + sale.saldo, 0))} tone={owing.length ? "warning" : "default"} />
        <Stat label="Vencido" value={currency(overdue.reduce((sum, sale) => sum + sale.saldo, 0))} tone={overdue.length ? "danger" : "default"} />
        <Stat className="col-span-2 sm:col-span-1" label="Cobrado este mes" value={currency(collectedThisMonth)} />
      </div>

      <nav aria-label="Secciones de cobros" className="-mx-4 border-b border-ink-200 bg-[#f8fafc] px-4 sm:-mx-6 sm:px-6 xl:sticky xl:top-0 xl:z-20">
        <ScrollHint fade="white" scrollerClassName="flex gap-1" role="tablist" aria-label="Secciones de cobros">
          {tabs.map((entry) => {
            const Icon = entry.icon;
            const selected = tab === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => select(entry.value)}
                className={cn(
                  "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400",
                  selected ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {entry.label}
                {entry.count !== null ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      entry.value === "revisar" && entry.count
                        ? "bg-amber-100 text-amber-800"
                        : entry.value === "vencidos" && entry.count
                          ? "bg-rose-100 text-rose-700"
                          : selected
                            ? "bg-brand-50 text-brand-700"
                            : "bg-ink-100 text-ink-500"
                    )}
                  >
                    {entry.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </ScrollHint>
      </nav>

      {tab === "pendientes" || tab === "vencidos" ? (
        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">Buscar</span>
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por cliente o plan"
              className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-700 placeholder:text-ink-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>
          <OwingList
            sales={filter(tab === "vencidos" ? overdue : owing)}
            empty={tab === "vencidos" ? "No hay saldos vencidos. Todo está en plazo." : "Nadie te debe. Todo está pagado."}
            onPay={setPaying}
          />
        </div>
      ) : null}

      {tab === "revisar" ? (
        receipts.length ? (
          <ReceiptReviewList receipts={receipts} />
        ) : (
          <EmptyState icon={<FiCheckCircle className="size-6" />} text="No hay comprobantes por revisar." />
        )
      ) : null}

      {tab === "historial" ? <PaymentsPanel sales={sales} today={today} embedded /> : null}

      {paying ? <RegisterPaymentModal sale={paying} today={today} onClose={() => setPaying(null)} /> : null}
    </div>
  );
}

function OwingList({ sales, empty, onPay }: { sales: MemberPackageSaleItem[]; empty: string; onPay: (sale: MemberPackageSaleItem) => void }) {
  if (!sales.length) return <EmptyState icon={<FiCheckCircle className="size-6" />} text={empty} />;

  return (
    <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
      {sales.map((sale) => (
        <li key={sale.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <Link href={`/dashboard/clientes/${sale.member.id}`} className="min-w-0 flex-1 rounded-lg hover:opacity-80">
            <span className="block truncate text-sm font-semibold text-ink-900">{memberName(sale.member)}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
              <ColorDot color={sale.discipline.color} className="size-2 shrink-0" />
              <span className="truncate">
                {sale.claseSuelta ? `Clase suelta · ${sale.discipline.nombre}` : `${sale.nombre} · ${sale.discipline.nombre}`}
              </span>
            </span>
            <span className={cn("mt-0.5 block text-xs font-medium", sale.saldoVencido ? "text-rose-600" : "text-ink-500")}>
              {sale.saldoVencido
                ? `Vencido hace ${sale.diasAtrasoSaldo === 1 ? "1 día" : `${sale.diasAtrasoSaldo} días`}`
                : sale.fechaLimitePago
                  ? `Paga antes del ${formatDateKeyShort(sale.fechaLimitePago)}`
                  : "Sin fecha límite"}
              {sale.pagado > 0 ? ` · pagó ${currency(sale.pagado)} de ${currency(sale.precio)}` : ""}
            </span>
          </Link>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className={cn("text-base font-black tabular-nums", sale.saldoVencido ? "text-rose-600" : "text-ink-900")}>{currency(sale.saldo)}</span>
            <Button className="min-h-10 rounded-xl px-4 text-sm font-medium shadow-none" onClick={() => onPay(sale)}>
              Registrar pago
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-10 text-center text-sm text-ink-500">
      <span className="text-brand-500">{icon}</span>
      {text}
    </div>
  );
}

function Stat({ label, value, tone = "default", className }: { label: string; value: string; tone?: "default" | "warning" | "danger"; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-ink-200 bg-white p-4 shadow-sm", className)}>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", tone === "danger" ? "text-rose-600" : tone === "warning" ? "text-amber-700" : "text-ink-900")}>
        {value}
      </p>
    </div>
  );
}
