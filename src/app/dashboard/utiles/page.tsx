import { PageHeader } from "@/components/ui/page-header";
import { SuppliesPaymentsPanel } from "@/components/dashboard/supplies-payments-panel";
import { apiFetch } from "@/lib/server-api";
import type { GroupSummary, StudentListItem, SuppliesPaymentItem } from "@/lib/web-types";

export default async function SuppliesPaymentsPage() {
  const [payments, groups, students] = await Promise.all([
    apiFetch<SuppliesPaymentItem[]>("/api/supplies-payments"),
    apiFetch<GroupSummary[]>("/api/groups"),
    apiFetch<StudentListItem[]>("/api/students")
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Cobros"
        title="Útiles y conceptos extra"
        description="Genera cobros adicionales por materiales o conceptos extraordinarios, individuales o por grupo."
      />
      <SuppliesPaymentsPanel payments={payments} groups={groups} students={students} />
    </div>
  );
}
