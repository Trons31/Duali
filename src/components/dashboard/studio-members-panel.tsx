"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiCalendar, FiChevronRight, FiPlus, FiSearch } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { EmptyCard } from "@/components/dashboard/studio-ui";
import { ClassesBar, MemberFormModal, PackageStatusBadge, daysLabel, formatClassDate, memberName } from "@/components/dashboard/studio-sales-ui";
import { cn, currency } from "@/lib/web-utils";
import type { StudioMemberItem } from "@/lib/web-types";

type Filter = "todos" | "con-plan" | "por-usar" | "saldo" | "sin-plan" | "vencidos";

type Member = StudioMemberItem;

// Spec 019 R4: "plan" = venta de mas de 1 clase vigente; "por usar" = le quedan clases.
const FILTERS: Array<{ value: Filter; label: string; match: (member: Member) => boolean }> = [
  { value: "todos", label: "Todos", match: () => true },
  { value: "con-plan", label: "Con plan", match: (member) => member.vigentes.some((item) => !item.claseSuelta) },
  { value: "por-usar", label: "Clases por usar", match: (member) => member.clasesDisponibles > 0 },
  { value: "saldo", label: "Con saldo", match: (member) => member.saldo > 0 },
  { value: "sin-plan", label: "Sin plan", match: (member) => !member.vigentes.length },
  // Spec 020 R7.
  { value: "vencidos", label: "Vencidos sin renovar", match: (member) => Boolean(expiredPlan(member)) }
];

/** El plan vencido sin renovar mas reciente (spec 020 R7), si no tiene otro vigente. */
function expiredPlan(member: Member) {
  if (member.vigentes.some((item) => !item.claseSuelta)) return null;
  return (
    member.packages
      .filter((item) => item.estado === "VENCIDO" && !item.claseSuelta && !item.renovadoPor && item.diasVencido <= RENEWAL_WINDOW_DAYS)
      .sort((a, b) => a.diasVencido - b.diasVencido)[0] ?? null
  );
}

/** El mismo plazo que RENEWAL_WINDOW_DAYS en el servidor. */
const RENEWAL_WINDOW_DAYS = 60;

/** Clientes del estudio (spec 006 R6; tarjetas y filtros de la spec 019 R4). */
export function StudioMembersPanel({ members }: { members: StudioMemberItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [creating, setCreating] = useState(false);


  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("es");
    const digits = query.replace(/\D/g, "");
    const match = FILTERS.find((entry) => entry.value === filter)!.match;
    const found = members.filter((member) => {
      if (!match(member)) return false;
      if (!text) return true;
      return (
        memberName(member).toLocaleLowerCase("es").includes(text) || (digits.length >= 3 && member.celular.includes(digits))
      );
    });
    // Spec 020 R7: del que vencio hace menos al que mas.
    return filter === "vencidos" ? found.sort((a, b) => expiredPlan(a)!.diasVencido - expiredPlan(b)!.diasVencido) : found;
  }, [members, query, filter]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Clientes</h1>
          <p className="mt-1 text-sm text-ink-500">Cuántas clases le quedan a cada uno, su próxima clase y si debe</p>
        </div>
        <Button className="w-full rounded-xl px-4 py-2 font-medium shadow-none sm:w-auto" onClick={() => setCreating(true)}>
          <FiPlus className="size-4" />
          Nuevo cliente
        </Button>
      </div>

      {members.length ? (
        <>
          <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-3 shadow-sm sm:p-4">
            <label className="relative block">
              <span className="sr-only">Buscar clientes</span>
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre o celular"
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
                  {entry.label} <span className="text-ink-400">{members.filter(entry.match).length}</span>
                </button>
              ))}
            </div>
          </div>

          {visible.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((member) => (
                <Link
                  key={member.id}
                  href={`/dashboard/clientes/${member.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-brand-200"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">
                      {member.nombre.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-800">{memberName(member)}</p>
                      <p className="text-xs text-ink-500">{member.celular}</p>
                    </div>
                    {member.saldo > 0 ? (
                      <span className="shrink-0 text-xs font-semibold text-rose-600">Debe {currency(member.saldo)}</span>
                    ) : null}
                    <FiChevronRight className="size-4 shrink-0 text-ink-300" />
                  </div>
                  {member.vigentes.length ? (
                    <div className="space-y-2.5 border-t border-ink-100 pt-3">
                      {member.vigentes.slice(0, 2).map((item) => (
                        <div key={item.id}>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-ink-600">
                              {item.nombre} · {item.discipline.nombre}
                            </p>
                            <PackageStatusBadge item={item} />
                          </div>
                          <ClassesBar item={item} />
                        </div>
                      ))}
                    </div>
                  ) : expiredPlan(member) ? (
                    <p className="border-t border-ink-100 pt-3 text-xs font-medium text-rose-600">
                      {expiredPlan(member)!.nombre} · {expiredPlan(member)!.discipline.nombre}: venció hace {daysLabel(expiredPlan(member)!.diasVencido)}
                    </p>
                  ) : (
                    <p className="border-t border-ink-100 pt-3 text-xs text-ink-400">Sin plan vigente</p>
                  )}
                  {member.proxima ? (
                    <p className="flex items-center gap-1.5 text-xs text-ink-600">
                      <FiCalendar className="size-3.5 shrink-0 text-ink-400" />
                      <span className="truncate">
                        Próxima: <span className="capitalize">{formatClassDate(member.proxima.fecha, member.proxima.horaInicio)}</span> ·{" "}
                        {member.proxima.disciplina}
                      </span>
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-500">No hay clientes con ese filtro.</p>
          )}
        </>
      ) : (
        <EmptyCard
          title="Aún no tienes clientes"
          description="Registra a quien compra un paquete o toma una clase suelta. Con su celular podrá reservar desde tu página."
          action={
            <Button className="rounded-xl px-4 py-2 font-medium shadow-none" onClick={() => setCreating(true)}>
              <FiPlus className="size-4" />
              Nuevo cliente
            </Button>
          }
        />
      )}

      {creating ? <MemberFormModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
