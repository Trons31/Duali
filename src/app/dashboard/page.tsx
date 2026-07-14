import { DashboardHome } from "@/components/dashboard/dashboard-home";
import {
  getDashboardGroupSummaries,
  getDashboardPendingPayments,
  toDashboardDueItems,
  toGroupSummaries
} from "@/lib/dashboard-data";
import { getAccountingSummary } from "@/lib/accounting";
import { auth } from "@/lib/web-auth";

export default async function DashboardPage() {
  const session = await auth();
  const clientId = session?.user?.id ?? "";
  const [summary, pending, groups] = await Promise.all([
    getAccountingSummary(clientId),
    getDashboardPendingPayments(clientId),
    getDashboardGroupSummaries(clientId)
  ]);

  return (
    <DashboardHome
      userName={session?.user?.name}
      businessName={session?.user?.businessName ?? "Duali"}
      summary={summary}
      pending={toDashboardDueItems(pending)}
      groups={toGroupSummaries(groups)}
    />
  );
}
