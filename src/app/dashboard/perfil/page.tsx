import { FiSettings } from "react-icons/fi";
import { ClientAccountSummary } from "@/components/dashboard/client-account-panel";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { apiFetch } from "@/lib/server-api";
import type { ClientPlanResponse, SafeClient } from "@/lib/web-types";

export default async function ProfilePage() {
  const profile = await apiFetch<SafeClient>("/api/client/profile");
  const plan = await apiFetch<ClientPlanResponse>("/api/client/plan");

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex min-w-0 items-start gap-3 px-1">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <FiSettings className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-700">Ajustes</p>
            <h1 className="mt-1 text-[1.75rem] font-black leading-none text-ink-950 sm:text-[2rem]">Perfil</h1>
            <p className="mt-2 hidden text-sm leading-5 text-ink-500 sm:block">Administra los datos y preferencias de tu negocio.</p>
          </div>
        </header>

        <ClientAccountSummary data={plan} />
        <ProfileForm profile={profile} />
      </div>
    </div>
  );
}
