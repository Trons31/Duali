import { ClientAccountSummary } from "@/components/dashboard/client-account-panel";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { apiFetch } from "@/lib/server-api";
import type { ClientPlanResponse, SafeClient } from "@/lib/web-types";

export default async function ProfilePage() {
  // En paralelo: son dos peticiones independientes y encadenarlas duplicaba
  // el tiempo de carga de la pagina.
  const [profile, plan] = await Promise.all([
    apiFetch<SafeClient>("/api/client/profile"),
    apiFetch<ClientPlanResponse>("/api/client/plan")
  ]);

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="min-w-0 px-1">
          <h1 className="text-2xl font-black leading-tight text-ink-950">Ajustes</h1>
          <p className="mt-1 text-sm text-ink-500">Configura los datos y preferencias de tu negocio.</p>
        </header>

        <ClientAccountSummary data={plan} />
        <ProfileForm profile={profile} />
      </div>
    </div>
  );
}
