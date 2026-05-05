import { DuePaymentsPanel } from "@/components/dashboard/due-payments-panel";
import { apiFetch } from "@/lib/server-api";

type DuePayment = any;

export default async function PendingPaymentsPage() {
  const items = await apiFetch<DuePayment[]>("/api/monthly-payments/pending");

  return <DuePaymentsPanel items={items} titleAction="pendiente" />;
}
