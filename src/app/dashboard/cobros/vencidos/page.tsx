import { DuePaymentsPanel } from "@/components/dashboard/due-payments-panel";
import { apiFetch } from "@/lib/server-api";

type DuePayment = any;

export default async function OverduePaymentsPage() {
  const items = await apiFetch<DuePayment[]>("/api/monthly-payments/overdue");

  return <DuePaymentsPanel items={items} titleAction="vencido" />;
}
