import { ClientAccountPanel } from "@/components/dashboard/client-account-panel";
import { apiFetch } from "@/lib/server-api";
import type { ClientPlanResponse } from "@/lib/web-types";

export default async function ClientPage() {
  const data = await apiFetch<ClientPlanResponse>("/api/client/plan");
  return <ClientAccountPanel data={data} />;
}
