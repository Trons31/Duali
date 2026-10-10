"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiCalendar, FiSearch } from "react-icons/fi";
import { ColorDot } from "@/components/dashboard/studio-ui";
import { DropInStatusBadge, PaymentStatusBadge, formatClassDate, formatDateKeyShort, memberName } from "@/components/dashboard/studio-sales-ui";
import { cn, currency } from "@/lib/web-utils";
import type { MemberPackageSaleItem } from "@/lib/web-types";

type Filter = "todas" | "por-usar" | "usadas" | "saldo";

const isUsed = (item: MemberPackageSaleItem) => item.clase?.estado === "ASISTIO" || item.clase?.estado === "NO_ASISTIO" || item.clase?.estado === "CANCELADA";

const FILTERS: Array<{ value: Filter; label: string; match: (item: MemberPackageSaleItem) => boolean }> = [
  { value: "todas", label: "Todas", match: (item) => item.estado !== "ANULADO" },
  { value: "por-usar", label: "Por usar", match: (item) => item.estado === "ACTIVO" && !isUsed(item) },
  { value: "usadas", label: "Usadas", match: isUsed },
  { value: "saldo", label: "Con saldo", match: (item) => item.saldo > 0 }
];

/**
 * Spec 019 R6: las clases sueltas (ventas de 1 clase), por la fecha de su clase,
 * sin barra ni vencimiento mensual: para que clase es, que paso y si se pago.
 */
export function DropInsPanel({ sales: allSales }: { sales: MemberPackageSaleItem[] }) {
  const [filter, setFilter] = useState<Filter>("todas");
  const [query, setQuery] = useState("");
  const sales = useMemo(() => allSales.filter((item) => item.claseSuelta), [allSales]);
  const porCobrar = sales.reduce((sum, item) => sum + item.saldo, 0);

  const groups = useMemo(() => {
    const match = FILTERS.find((entry) => entry.value === filter)!.match;
    const text = query.trim().toLocaleLowerCase("es");
    const visible = sales
      .filter((item) => match(item) && (!text || `${memberName(item.member)} ${item.discipline.nombre}`.toLocaleLowerCase("es").includes(text)))
      // Por la fecha de su clase; las que aun no tienen clase, por la venta.
      .map((item) => ({ item, key: item.clase?.fecha ?? item.inicio }))
      .sort((a, b) => b.key.localeCompare(a.key));
    const byDay = new Map<string, MemberPackageSaleItem[]>();
    for (const { item, key } of visible) byDay.set(key, [...(byDay.get(key) ?? []), item]);
    return [...byDay.entries()];
  }, [sales, filter, query]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Clases sueltas</h1>
        <p className="mt-1 text-sm text-ink-500">Quien pagó una sola clase: para cuál es, si vino y si ya pagó</p>
      </div>

      {sales.length ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-ink-500">Por usar</p>
              <p className="mt-1 text-xl font-bold text-ink-900">{sales.filter(FILTERS[1].match).length}</p>
            </div>
            <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-ink-500">Por cobrar</p>
              <p className={cn("mt-1 text-xl font-bold", porCobrar > 0 ? "text-rose-600" : "text-ink-900")}>{currency(porCobrar)}</p>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-3 shadow-sm sm:p-4">
            <label className="relative block">
              <span className="sr-only">Buscar clases sueltas</span>
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente o disciplina"
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

          {groups.length ? (
            <div className="space-y-5">
              {groups.map(([day, items]) => (
                <section key={day}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{formatDateKeyShort(day)}</h2>
                  <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/dashboard/clientes/${item.member.id}`}
                          className="block space-y-2 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-brand-200"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink-800">{memberName(item.member)}</p>
                              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-500">
                                <ColorDot color={item.discipline.color} className="size-2" />
                                {item.discipline.nombre}
                              </p>
                            </div>
                            <DropInStatusBadge item={item} />
                          </div>
                          <p className="flex items-center gap-1.5 text-xs text-ink-600">
                            <FiCalendar className="size-3.5 text-ink-400" />
                            {item.clase ? (
                              <span className="capitalize">{formatClassDate(item.clase.fecha, item.clase.horaInicio)}</span>
                            ) : (
                              <span>Sin clase asignada · vence {formatDateKeyShort(item.vence)}</span>
                            )}
                          </p>
                          <div className="flex items-center justify-between gap-2 border-t border-ink-100 pt-2 text-xs">
                            <span className="text-ink-500">{currency(item.precio)}</span>
                            <PaymentStatusBadge item={item} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-500">No hay clases sueltas con ese filtro.</p>
          )}
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-ink-200 bg-white py-10 text-center text-sm text-ink-500">
          Aún no hay clases sueltas. Se venden al reservar a alguien sin plan o desde la ficha del cliente.
        </p>
      )}
    </div>
  );
}
