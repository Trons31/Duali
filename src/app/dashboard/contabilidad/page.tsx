import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { apiFetch } from "@/lib/server-api";
import { currency } from "@/lib/web-utils";
import type { AccountingSummary } from "@/lib/web-types";

export default async function AccountingPage() {
  const [summary, incomeBreakdown] = await Promise.all([
    apiFetch<AccountingSummary>("/api/accounting/summary"),
    apiFetch<{ mensualidades: number; utiles: number; inscripciones: number }>("/api/accounting/income")
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finanzas"
        title="Contabilidad"
        description="Consulta el estado financiero general del negocio, desde ingresos por categoría hasta el balance actual."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ingresos totales" value={currency(summary.ingresosTotales)} tone="success" />
        <StatCard label="Gastos totales" value={currency(summary.gastosTotales)} tone="danger" />
        <StatCard label="Balance actual" value={currency(summary.balance)} tone={summary.balance >= 0 ? "success" : "danger"} />
        <StatCard label="Cobros del mes" value={currency(summary.pagosRecibidosEsteMes)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StatCard label="Mensualidades pagadas" value={currency(incomeBreakdown.mensualidades)} />
        <StatCard label="Inscripciones pagadas" value={currency(incomeBreakdown.inscripciones)} />
        <StatCard label="Útiles pagados" value={currency(incomeBreakdown.utiles)} />
      </section>
    </div>
  );
}
