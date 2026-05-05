import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { apiFetch } from "@/lib/server-api";
import { auth } from "@/lib/web-auth";
import type { AccountingSummary, GroupSummary } from "@/lib/web-types";

type DueItem = {
  id: string;
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  monto: number | string;
  fechaVencimiento: string;
  student: {
    nombre: string;
    apellido: string;
  };
  group?: {
    nombre: string;
  } | null;
};

export default async function DashboardPage() {
  const session = await auth();
  const [summary, pending, groups] = await Promise.all([
    apiFetch<AccountingSummary>("/api/accounting/summary"),
    apiFetch<DueItem[]>("/api/monthly-payments/pending"),
    apiFetch<GroupSummary[]>("/api/groups")
  ]);

  return (
    <DashboardHome
      userName={session?.user?.name}
      businessName={session?.user?.businessName ?? "Duali"}
      summary={summary}
      pending={pending}
      groups={groups}
    />
  );
}
