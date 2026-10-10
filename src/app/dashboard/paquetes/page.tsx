import { StudioCatalogPanel } from "@/components/dashboard/studio-catalog-panel";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import { apiFetch } from "@/lib/server-api";
import { auth } from "@/lib/web-auth";
import type { DisciplineItem, PackageItem } from "@/lib/web-types";

export default async function PackagesPage() {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");

  if (!modules.moduloEstudio) return <StudioModuleNotice title="Paquetes" />;

  const [disciplines, packages] = await Promise.all([
    apiFetch<DisciplineItem[]>("/api/disciplines"),
    apiFetch<PackageItem[]>("/api/packages")
  ]);

  return <StudioCatalogPanel disciplines={disciplines} packages={packages} />;
}
