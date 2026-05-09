import { ClientAccountSummary } from "@/components/dashboard/client-account-panel";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/server-api";
import type { ClientPlanResponse, SafeClient } from "@/lib/web-types";

export default async function ProfilePage() {
  const [profile, plan] = await Promise.all([
    apiFetch<SafeClient>("/api/client/profile"),
    apiFetch<ClientPlanResponse>("/api/client/plan")
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Ajustes"
        title="Perfil del negocio"
        description="Actualiza los datos visibles de tu cuenta, del negocio y revisa el estado de tu plan."
      />
      <ClientAccountSummary data={plan} />
      <ProfileForm profile={profile} />
    </div>
  );
}
