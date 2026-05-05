import { GroupDetailPanel } from "@/components/dashboard/group-detail-panel";
import { apiFetch } from "@/lib/server-api";
import type { GroupDetailResponse } from "@/lib/web-types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function GroupDetailPage({ params }: Props) {
  const { id } = await params;
  const group = await apiFetch<GroupDetailResponse>(`/api/groups/${id}`);

  return <GroupDetailPanel group={group} />;
}
