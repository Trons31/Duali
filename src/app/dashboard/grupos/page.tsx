import { GroupsPanel } from "@/components/dashboard/groups-panel";
import { apiFetch } from "@/lib/server-api";
import type { GroupSummary } from "@/lib/web-types";

export default async function GroupsPage() {
  const groups = await apiFetch<GroupSummary[]>("/api/groups");

  return <GroupsPanel groups={groups} />;
}
