import { PageHeader } from "@/components/ui/page-header";
import { DuePaymentsPanel } from "@/components/dashboard/due-payments-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/server-api";

type DuePayment = any;

export default async function PendingPaymentsPage() {
  const items = await apiFetch<DuePayment[]>("/api/monthly-payments/pending");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Cobros"
        title="Pendientes de hoy"
        description="Estos cobros ya están programados para hoy y aún necesitan seguimiento del administrador."
      />
      {items.length ? (
        <DuePaymentsPanel items={items} titleAction="pendiente" />
      ) : (
        <EmptyState title="Sin pendientes para hoy" description="Todo lo programado para la fecha actual ya está al día." />
      )}
    </div>
  );
}
