import { PageHeader } from "@/components/ui/page-header";
import { EnrollmentPaymentsPanel } from "@/components/dashboard/enrollment-payments-panel";
import { apiFetch } from "@/lib/server-api";
import type { EnrollmentPaymentItem } from "@/lib/web-types";

export default async function EnrollmentPaymentsPage() {
  const payments = await apiFetch<EnrollmentPaymentItem[]>("/api/enrollment-payments");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Cobros"
        title="Inscripciones"
        description="Supervisa el estado de las inscripciones de cada estudiante y confirma pagos pendientes."
      />
      <EnrollmentPaymentsPanel payments={payments} />
    </div>
  );
}
