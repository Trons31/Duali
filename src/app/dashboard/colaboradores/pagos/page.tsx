import { InstructorPaymentsPanel } from "@/components/dashboard/instructor-payments-panel";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import type { InstructorPaymentsView } from "@/lib/instructor-ledger";
import type { PaymentHistoryGroup } from "@/lib/instructor-payments";
import { can, getPageAccess } from "@/lib/page-access";
import { apiFetch } from "@/lib/server-api";
import { auth } from "@/lib/web-auth";

/** Spec 023 R6–R13 (en Colaboradores desde la spec 024): pagos a instructores. */
export default async function InstructorPaymentsPage() {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Pagos a instructores" />;

  const access = await getPageAccess();
  // El historial despues: la consulta de pendientes materializa los ciclos.
  const data = await apiFetch<InstructorPaymentsView>("/api/instructor-payments");
  const history = data.configurado ? await apiFetch<PaymentHistoryGroup[]>("/api/instructor-payments/history") : [];
  return <InstructorPaymentsPanel data={data} history={history} canPay={can(access, "HACER_PAGOS")} canConfigure={can(access, "EQUIPO")} />;
}
