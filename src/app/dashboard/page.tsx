import Link from "next/link";
import { headers } from "next/headers";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { StudioHome } from "@/components/dashboard/studio-home";
import {
  getDashboardGroupSummaries,
  getDashboardPendingPayments,
  toDashboardDueItems,
  toGroupSummaries
} from "@/lib/dashboard-data";
import { getAccountingSummary } from "@/lib/accounting";
import { getBusinessModules } from "@/lib/business-modules";
import { getStudioDashboard } from "@/lib/studio-dashboard";
import { auth } from "@/lib/web-auth";
import { cn, getAppBaseUrl } from "@/lib/web-utils";

type Props = { searchParams: Promise<{ vista?: string }> };

// Spec 013: solo Academia → Inicio de siempre; solo Estudio → Inicio del estudio;
// ambos → selector arriba (por defecto Estudio).
export default async function DashboardPage({ searchParams }: Props) {
  const session = await auth();
  const clientId = session?.user?.id ?? "";
  const modules = await getBusinessModules(clientId);
  const { vista } = await searchParams;
  const both = modules.moduloAcademia && modules.moduloEstudio;
  const showStudio = modules.moduloEstudio && !(both && vista === "academia");

  const selector = both ? (
    <div className="mb-4 inline-flex rounded-xl border border-ink-200 bg-white p-1 shadow-sm sm:mb-6" role="tablist" aria-label="Inicio">
      {(
        [
          ["estudio", "Estudio"],
          ["academia", "Academia"]
        ] as const
      ).map(([value, label]) => {
        const active = value === "estudio" ? showStudio : !showStudio;
        return (
          <Link
            key={value}
            href={value === "estudio" ? "/dashboard" : "/dashboard?vista=academia"}
            role="tab"
            aria-selected={active}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-medium transition-colors", active ? "bg-brand-500 text-white shadow-sm" : "text-ink-600 hover:bg-ink-50")}
          >
            {label}
          </Link>
        );
      })}
    </div>
  ) : null;

  if (showStudio) {
    const headerStore = await headers();
    const data = await getStudioDashboard(clientId);
    return (
      <>
        {selector}
        <StudioHome
          data={data}
          userName={session?.user?.name}
          baseUrl={getAppBaseUrl(headerStore.get("host"), headerStore.get("x-forwarded-proto"))}
        />
      </>
    );
  }

  const [summary, pending, groups] = await Promise.all([
    getAccountingSummary(clientId),
    getDashboardPendingPayments(clientId),
    getDashboardGroupSummaries(clientId)
  ]);

  return (
    <>
      {selector}
      <DashboardHome
        userName={session?.user?.name}
        businessName={session?.user?.businessName ?? "Duali"}
        summary={summary}
        pending={toDashboardDueItems(pending)}
        groups={toGroupSummaries(groups)}
      />
    </>
  );
}
