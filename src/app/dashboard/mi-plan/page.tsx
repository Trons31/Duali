import { ClientPlanPanel } from "@/components/dashboard/client-plan-panel";
import { apiFetch } from "@/lib/server-api";
import type { ClientPlanResponse } from "@/lib/web-types";

export default async function MyPlanPage() {
  const data = await apiFetch<ClientPlanResponse>("/api/client/plan");
  return <ClientPlanPanel data={data} />;
}
