import { SettingsSections } from "@/components/dashboard/settings-sections";
import { apiFetch } from "@/lib/server-api";
import type { SafeClient } from "@/lib/web-types";

export default async function SettingsPage() {
  const profile = await apiFetch<SafeClient>("/api/client/profile");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Ajustes</h1>
        <p className="mt-1 text-sm text-ink-500">Configura los datos de tu academia</p>
      </div>

      <SettingsSections profile={profile} />
    </div>
  );
}
