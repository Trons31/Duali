import { headers } from "next/headers";
import { PublicPagePanel } from "@/components/dashboard/public-page-panel";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import { apiFetch } from "@/lib/server-api";
import { auth } from "@/lib/web-auth";
import { getAppBaseUrl } from "@/lib/web-utils";

type PublicPageState = {
  slug: string | null;
  sugerido: string | null;
  paginaPublicaActiva: boolean;
  businessName: string;
  portadaUrl: string | null;
  portadaPublicId: string | null;
};

export default async function MyPublicPage() {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Página pública" />;

  const headerStore = await headers();
  const [state] = await Promise.all([apiFetch<PublicPageState>("/api/client/public-page")]);
  const baseUrl = getAppBaseUrl(headerStore.get("host"), headerStore.get("x-forwarded-proto"));

  return <PublicPagePanel state={state} baseUrl={baseUrl} />;
}
