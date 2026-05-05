import { PageHeader } from "@/components/ui/page-header";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { apiFetch } from "@/lib/server-api";
import type { SafeClient } from "@/lib/web-types";

export default async function ProfilePage() {
  const profile = await apiFetch<SafeClient>("/api/client/profile");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Ajustes"
        title="Perfil del negocio"
        description="Actualiza los datos visibles de tu cuenta y del negocio que usas en la operación diaria."
      />
      <ProfileForm profile={profile} />
    </div>
  );
}
