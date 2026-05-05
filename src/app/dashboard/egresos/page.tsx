import { ExpensesPanel } from "@/components/dashboard/expenses-panel";
import { apiFetch } from "@/lib/server-api";
import type { ExpenseItem } from "@/lib/web-types";

export default async function ExpensesPage() {
  const expenses = await apiFetch<ExpenseItem[]>("/api/expenses");

  return <ExpensesPanel expenses={expenses} />;
}
