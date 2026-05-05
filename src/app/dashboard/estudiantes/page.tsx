import { StudentsPanelCards } from "@/components/dashboard/students-panel-cards";
import { apiFetch } from "@/lib/server-api";
import type { GroupSummary, StudentListResponse } from "@/lib/web-types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StudentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = first(params.page) ?? "1";
  const q = first(params.q) ?? "";
  const status = first(params.status) ?? "todos";
  const groupId = first(params.groupId);
  const pageSize = first(params.pageSize) ?? "12";

  const query = new URLSearchParams({
    page,
    q,
    status,
    pageSize
  });

  if (groupId) query.set("groupId", groupId);

  const [students, groups] = await Promise.all([
    apiFetch<StudentListResponse>(`/api/students?${query.toString()}`),
    apiFetch<GroupSummary[]>("/api/groups")
  ]);

  return <StudentsPanelCards students={students} groups={groups} />;
}

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}
