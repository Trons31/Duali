import { PageHeader } from "@/components/ui/page-header";
import { DuePaymentsPanel } from "@/components/dashboard/due-payments-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/server-api";

type DuePayment = any;

export default async function OverduePaymentsPage() {
  const items = await apiFetch<DuePayment[]>("/api/monthly-payments/overdue");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Cobros"
        title="Vencidos"
        description="Lista crítica de mensualidades e inscripciones fuera de fecha para tomar acción cuanto antes."
      />
      {items.length ? (
        <DuePaymentsPanel items={items} titleAction="vencido" />
      ) : (
        <EmptyState title="No hay vencidos activos" description="Excelente. Por ahora no tienes cobros atrasados por resolver." />
      )}
    </div>
  );
}
