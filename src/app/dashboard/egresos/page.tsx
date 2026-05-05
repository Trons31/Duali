import { PageHeader } from "@/components/ui/page-header";
import { ExpensesPanel } from "@/components/dashboard/expenses-panel";
import { apiFetch } from "@/lib/server-api";
import type { ExpenseItem } from "@/lib/web-types";

export default async function ExpensesPage() {
  const expenses = await apiFetch<ExpenseItem[]>("/api/expenses");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finanzas"
        title="Egresos"
        description="Registra gastos operativos, clasifícalos y mantenlos dentro del balance real del negocio."
      />
      <ExpensesPanel expenses={expenses} />
    </div>
  );
}
