import { GroupDetailPanel } from "@/components/dashboard/group-detail-panel";
import { apiFetch } from "@/lib/server-api";
import type { GroupDetailResponse } from "@/lib/web-types";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GroupDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const filters = await searchParams;
  const page = first(filters.page) ?? "1";
  const q = first(filters.q) ?? "";
  const status = first(filters.status) ?? "todos";
  const pageSize = first(filters.pageSize) ?? "10";
  const query = new URLSearchParams({ page, q, status, pageSize });
  const group = await apiFetch<GroupDetailResponse>(`/api/groups/${id}?${query.toString()}`);

  return <GroupDetailPanel group={group} />;
}

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}
