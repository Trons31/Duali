"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiSearch, FiShoppingBag } from "react-icons/fi";
import { ColorDot, EmptyCard } from "@/components/dashboard/studio-ui";
import { ClassesBar, OnlineBadge, PackageStatusBadge, PaymentStatusBadge, RenewalNote, memberName } from "@/components/dashboard/studio-sales-ui";
import { cn, currency } from "@/lib/web-utils";
import type { MemberPackageSaleItem } from "@/lib/web-types";

type Filter = "vigentes" | "por-vencer" | "saldo" | "revision" | "terminados" | "anulados";

const FILTERS: Array<{ value: Filter; label: string; match: (item: MemberPackageSaleItem) => boolean }> = [
  { value: "vigentes", label: "Vigentes", match: (item) => item.estado === "ACTIVO" },
  { value: "por-vencer", label: "Por vencer", match: (item) => item.porVencer || item.pocasClases },
  { value: "saldo", label: "Con saldo", match: (item) => item.saldo > 0 },
  // Spec 021 R12.
  { value: "revision", label: "Pago en revisión", match: (item) => item.situacionPago === "EN_REVISION" },
  { value: "terminados", label: "Terminados", match: (item) => item.estado === "VENCIDO" || item.estado === "AGOTADO" },
  { value: "anulados", label: "Anulados", match: (item) => item.estado === "ANULADO" }
];

/** Planes vendidos (spec 006 R6; spec 019 R5: solo planes, las clases sueltas van aparte). */
export function MemberSalesPanel({ sales: allSales, today }: { sales: MemberPackageSaleItem[]; today: string }) {
  const sales = useMemo(() => allSales.filter((item) => !item.claseSuelta), [allSales]);
  const [filter, setFilter] = useState<Filter>("vigentes");
  const [query, setQuery] = useState("");
  const month = today.slice(0, 7);

  const totals = useMemo(() => {
    const valid = sales.filter((item) => item.estado !== "ANULADO");
    return {
      vigentes: valid.filter((item) => item.estado === "ACTIVO").length,
      porCobrar: valid.reduce((sum, item) => sum + item.saldo, 0),
      vendidoMes: valid.filter((item) => item.inicio.startsWith(month)).reduce((sum, item) => sum + item.precio, 0)
    };
  }, [sales, month]);

  const visible = useMemo(() => {
    const match = FILTERS.find((entry) => entry.value === filter)!.match;
    const text = query.trim().toLocaleLowerCase("es");
    return sales.filter(
      (item) =>
        match(item) &&
        (!text ||
          `${memberName(item.member)} ${item.nombre} ${item.discipline.nombre}`.toLocaleLowerCase("es").includes(text))
    );
  }, [sales, filter, query]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Planes vendidos</h1>
        <p className="mt-1 text-sm text-ink-500">Planes de varias clases: cuántas quedan, cuáles tomaron y lo que deben</p>
      </div>

      {sales.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Vigentes" value={String(totals.vigentes)} />
            <Stat label="Por cobrar" value={currency(totals.porCobrar)} tone={totals.porCobrar > 0 ? "danger" : "default"} />
            <Stat className="col-span-2 sm:col-span-1" label="Vendido este mes" value={currency(totals.vendidoMes)} />
          </div>

          <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-3 shadow-sm sm:p-4">
            <label className="relative block">
              <span className="sr-only">Buscar ventas</span>
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente, plan o disciplina"
                className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-700 placeholder:text-ink-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  aria-pressed={filter === entry.value}
                  onClick={() => setFilter(entry.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === entry.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:bg-ink-50"
                  )}
                >
                  {entry.label} <span className="text-ink-400">{sales.filter(entry.match).length}</span>
                </button>
              ))}
            </div>
          </div>

          {visible.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/clientes/${item.member.id}`}
                  className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-brand-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-800">{memberName(item.member)}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-500">
                        <ColorDot color={item.discipline.color} className="size-2" />
                        {item.nombre} · {item.discipline.nombre}
                        <OnlineBadge item={item} />
                      </p>
                    </div>
                    <PackageStatusBadge item={item} />
                  </div>
                  <RenewalNote item={item} />
                  {item.estado !== "ANULADO" ? <ClassesBar item={item} legend /> : null}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-ink-500">{currency(item.precio)}</span>
                    <PaymentStatusBadge item={item} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-500">No hay planes con ese filtro.</p>
          )}
        </>
      ) : (
        <EmptyCard
          title="Aún no has vendido planes"
          description="Los planes se venden desde la ficha de cada cliente o al reservar."
          action={
            <Link
              href="/dashboard/clientes"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <FiShoppingBag className="size-4" />
              Ir a Clientes
            </Link>
          }
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  className
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-ink-200 bg-white p-4 shadow-sm", className)}>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone === "danger" ? "text-rose-600" : "text-ink-900")}>{value}</p>
    </div>
  );
}
