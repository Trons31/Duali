import { AccountingPanel } from "@/components/dashboard/accounting-panel";
import type { AccountingReport } from "@/lib/accounting-report";
import { apiFetch } from "@/lib/server-api";
import { studioTodayKey } from "@/lib/studio-time";

const PARAMS = ["filter", "from", "to", "month", "day", "cycle"] as const;

/** Spec 028: Contabilidad como la de CliqCut; el periodo va en la URL. */
export default async function AccountingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const resolved = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  for (const key of PARAMS) {
    const value = resolved[key];
    if (typeof value === "string" && value) query.set(key, value);
  }

  const report = await apiFetch<AccountingReport>(`/api/accounting/report${query.size ? `?${query.toString()}` : ""}`);
  // La llave remonta los campos de fecha al cambiar de periodo.
  return <AccountingPanel key={`${report.period.filter}-${report.period.from}-${report.period.to}`} report={report} today={studioTodayKey()} />;
}
