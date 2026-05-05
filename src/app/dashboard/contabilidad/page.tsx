import { AccountingOverviewPanel } from "@/components/dashboard/accounting-overview-panel";
import { apiFetch } from "@/lib/server-api";
import type { AccountingOverview } from "@/lib/web-types";

export default async function AccountingPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const year = typeof resolved.year === "string" ? resolved.year : "";
  const month = typeof resolved.month === "string" ? resolved.month : "";
  const query = new URLSearchParams();

  if (year) query.set("year", year);
  if (month) query.set("month", month);

  const path = `/api/accounting/overview${query.toString() ? `?${query.toString()}` : ""}`;
  const data = await apiFetch<AccountingOverview>(path);

  return <AccountingOverviewPanel data={data} />;
}
