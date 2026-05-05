import { PageHeader } from "@/components/ui/page-header";
import { MonthlyPaymentsPanel } from "@/components/dashboard/monthly-payments-panel";
import { apiFetch } from "@/lib/server-api";
import type { GroupSummary, MonthlyPaymentItem, StudentListItem } from "@/lib/web-types";

export default async function MonthlyPaymentsPage() {
  const [payments, students, groups] = await Promise.all([
    apiFetch<MonthlyPaymentItem[]>("/api/monthly-payments"),
    apiFetch<StudentListItem[]>("/api/students"),
    apiFetch<GroupSummary[]>("/api/groups")
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Cobros"
        title="Mensualidades"
        description="Crea cobros manuales, genera lotes por grupo y marca pagos sin salir del panel."
      />
      <MonthlyPaymentsPanel payments={payments} students={students} groups={groups} />
    </div>
  );
}
