import { ContentPanel } from "@/components/dashboard/content-panel";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import { apiFetch } from "@/lib/server-api";
import { auth } from "@/lib/web-auth";
import type { ContentPostItem, DisciplineItem } from "@/lib/web-types";

export default async function ContentPage() {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Contenido" />;

  const [posts, disciplines] = await Promise.all([
    apiFetch<ContentPostItem[]>("/api/content-posts"),
    apiFetch<DisciplineItem[]>("/api/disciplines")
  ]);

  return <ContentPanel posts={posts} disciplines={disciplines.filter((discipline) => discipline.activa)} />;
}
