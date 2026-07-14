"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";

type AdminLoginValues = {
  email: string;
  password: string;
};

export function AdminLoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<AdminLoginValues>({
    defaultValues: { email: "", password: "" }
  });

  async function onSubmit(values: AdminLoginValues) {
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false
    });

    if (result?.error) {
      sileo.error({ title: "Acceso administrativo inválido" });
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-ink-100 bg-white px-6 py-6 shadow-soft">
        <div className="flex items-center gap-3">
          <BrandLogo size={54} priority />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-brand-700">Duali admin</p>
            <h1 className="text-xl font-black text-ink-950">Panel administrativo</h1>
          </div>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Correo admin</label>
            <input type="email" className="field-base" {...register("email", { required: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Contraseña</label>
            <input type="password" className="field-base" {...register("password", { required: true })} />
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Entrar
          </Button>
        </form>
      </section>
    </main>
  );
}
