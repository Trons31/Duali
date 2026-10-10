"use client";

import { useState } from "react";
import { FiLayers, FiTag, FiUsers } from "react-icons/fi";
import { DropInsPanel } from "@/components/dashboard/drop-ins-panel";
import { MemberSalesPanel } from "@/components/dashboard/member-sales-panel";
import { StudioMembersPanel } from "@/components/dashboard/studio-members-panel";
import { ScrollHint } from "@/components/shared/scroll-hint";
import { cn } from "@/lib/web-utils";
import type { MemberPackageSaleItem, StudioMemberItem } from "@/lib/web-types";

export type ClientsTab = "clientes" | "planes" | "sueltas";

/**
 * Spec 019 D1/R3: una sola seccion con pestanas generales (como CliqCut):
 * Clientes · Planes · Clases sueltas. La pestana activa queda en la URL (?tab=).
 */
export function ClientsHub({
  initialTab,
  members,
  sales,
  today
}: {
  initialTab: ClientsTab;
  members: StudioMemberItem[];
  sales: MemberPackageSaleItem[];
  today: string;
}) {
  const [tab, setTab] = useState<ClientsTab>(initialTab);
  const plans = sales.filter((item) => !item.claseSuelta);
  const dropIns = sales.filter((item) => item.claseSuelta);

  const tabs = [
    { value: "clientes", label: "Clientes", icon: FiUsers, count: members.length },
    { value: "planes", label: "Planes", icon: FiLayers, count: plans.filter((item) => item.estado === "ACTIVO").length },
    { value: "sueltas", label: "Clases sueltas", icon: FiTag, count: dropIns.filter((item) => item.estado !== "ANULADO").length }
  ] as const;

  function select(value: ClientsTab) {
    setTab(value);
    // Sin navegar: solo deja la pestana en la direccion para volver o compartirla.
    const url = new URL(window.location.href);
    if (value === "clientes") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <nav aria-label="Secciones de clientes" className="-mx-4 border-b border-ink-200 bg-[#f8fafc] px-4 sm:-mx-6 sm:px-6 xl:sticky xl:top-0 xl:z-20">
        <ScrollHint fade="white" scrollerClassName="flex gap-1" role="tablist" aria-label="Secciones de clientes">
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
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", selected ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500")}>
                  {entry.count}
                </span>
              </button>
            );
          })}
        </ScrollHint>
      </nav>

      {tab === "clientes" ? <StudioMembersPanel members={members} /> : null}
      {tab === "planes" ? <MemberSalesPanel sales={sales} today={today} /> : null}
      {tab === "sueltas" ? <DropInsPanel sales={sales} /> : null}
    </div>
  );
}
