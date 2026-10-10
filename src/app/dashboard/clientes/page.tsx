import { ClientsHub, type ClientsTab } from "@/components/dashboard/clients-hub";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import { apiFetch } from "@/lib/server-api";
import { studioTodayKey } from "@/lib/studio-time";
import { auth } from "@/lib/web-auth";
import type { MemberPackageSaleItem, StudioMemberItem } from "@/lib/web-types";

/** Spec 019 D1: Clientes · Planes · Clases sueltas en una sola seccion (?tab=). */
export default async function StudioMembersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Clientes" />;

  const { tab } = await searchParams;
  const initialTab: ClientsTab = tab === "planes" || tab === "sueltas" ? tab : "clientes";
  const [members, sales] = await Promise.all([
    apiFetch<StudioMemberItem[]>("/api/studio-members"),
    apiFetch<MemberPackageSaleItem[]>("/api/member-packages")
  ]);
  return <ClientsHub initialTab={initialTab} members={members} sales={sales} today={studioTodayKey()} />;
}
