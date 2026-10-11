import { StudioCollectionsHub, type CollectionsTab } from "@/components/dashboard/studio-collections-hub";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import type { ReceiptView } from "@/lib/receipts";
import { apiFetch } from "@/lib/server-api";
import { studioTodayKey } from "@/lib/studio-time";
import { auth } from "@/lib/web-auth";
import type { MemberPackageSaleItem } from "@/lib/web-types";

const TABS: CollectionsTab[] = ["pendientes", "vencidos", "revisar", "historial"];

/** Spec 027 D5: Ventas › Cobros (Pendientes · Vencidos · Por revisar · Historial, en ?tab=). */
export default async function StudioCollectionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Cobros" />;

  const { tab } = await searchParams;
  const initialTab = TABS.includes(tab as CollectionsTab) ? (tab as CollectionsTab) : "pendientes";
  const [sales, receipts] = await Promise.all([
    apiFetch<MemberPackageSaleItem[]>("/api/member-packages"),
    apiFetch<ReceiptView[]>("/api/payment-receipts?estado=POR_REVISAR").catch(() => [])
  ]);
  return <StudioCollectionsHub initialTab={initialTab} sales={sales} receipts={receipts} today={studioTodayKey()} />;
}
