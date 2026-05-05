import { PaymentsHistoryPanel } from "@/components/dashboard/payments-history-panel";
import { apiFetch } from "@/lib/server-api";
import type { PaymentHistoryResponse } from "@/lib/web-types";

export default async function PaymentsHistoryPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const period = typeof resolved.period === "string" ? resolved.period : "month";
  const month = typeof resolved.month === "string" ? resolved.month : "";
  const query = new URLSearchParams();

  if (period === "week" || period === "month") {
    query.set("period", period);
  }

  if (month) {
    query.set("month", month);
  }

  const path = `/api/payments/history${query.toString() ? `?${query.toString()}` : ""}`;
  const data = await apiFetch<PaymentHistoryResponse>(path);

  return <PaymentsHistoryPanel data={data} />;
}
