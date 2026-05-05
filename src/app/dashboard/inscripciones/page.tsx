import { EnrollmentPaymentsPanel } from "@/components/dashboard/enrollment-payments-panel";
import { apiFetch } from "@/lib/server-api";
import type { EnrollmentPaymentItem } from "@/lib/web-types";

export default async function EnrollmentPaymentsPage() {
  const payments = await apiFetch<EnrollmentPaymentItem[]>("/api/enrollment-payments");

  return <EnrollmentPaymentsPanel payments={payments} />;
}
