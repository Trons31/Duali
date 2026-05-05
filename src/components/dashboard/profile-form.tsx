"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";
import { Button } from "@/components/ui/button";
import { clientApiFetch } from "@/lib/client-api";
import type { SafeClient } from "@/lib/web-types";

type ProfileFormValues = Pick<SafeClient, "nombre" | "telefono" | "businessName">;

export function ProfileForm({ profile }: { profile: SafeClient }) {
  const { data: session } = useSession();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<ProfileFormValues>({
    defaultValues: {
      nombre: profile.nombre,
      telefono: profile.telefono ?? "",
      businessName: profile.businessName
    }
  });

  async function onSubmit(values: ProfileFormValues) {
    const token = session?.user.apiToken;
    if (!token) return;

    await clientApiFetch("/api/client/profile", token, {
      method: "PUT",
      body: JSON.stringify(values)
    })
      .then(() => {
        sileo.success({ title: "Perfil actualizado" });
        router.refresh();
      })
      .catch((error: Error) => {
        sileo.error({ title: error.message });
      });
  }

  return (
    <form className="shell-card grid gap-4 p-5 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label className="mb-2 block text-sm font-semibold text-ink-700">Tu nombre</label>
        <input className="field-base" {...register("nombre")} />
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold text-ink-700">Negocio</label>
        <input className="field-base" {...register("businessName")} />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-2 block text-sm font-semibold text-ink-700">Teléfono</label>
        <input className="field-base" {...register("telefono")} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
