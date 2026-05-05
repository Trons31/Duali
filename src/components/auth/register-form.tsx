"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import { sileo } from "sileo";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";

type RegisterFormValues = {
  nombre: string;
  email: string;
  telefono?: string;
  businessName: string;
  password: string;
};

export function RegisterForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormValues>();

  async function onSubmit(values: RegisterFormValues) {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(values)
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      sileo.error({ title: payload?.error ?? "No se pudo crear la cuenta" });
      return;
    }

    await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false
    });

    sileo.success({ title: "Tu cuenta quedó lista" });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <BrandLogo size={72} priority />
          </div>
          <h1 className="text-3xl font-black text-ink-950">Crea tu cuenta en Duali</h1>
          <p className="mt-2 text-sm text-ink-500">
            Configura tu espacio y comienza a manejar estudiantes, cobros y recordatorios desde web.
          </p>
        </div>

        <div className="shell-card p-6 sm:p-8">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">Tu nombre</label>
              <input className="field-base" {...register("nombre", { required: "Ingresa tu nombre" })} />
              {errors.nombre ? <p className="mt-2 text-sm text-rose-600">{errors.nombre.message}</p> : null}
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">Negocio</label>
              <input className="field-base" {...register("businessName", { required: "Ingresa el nombre del negocio" })} />
              {errors.businessName ? (
                <p className="mt-2 text-sm text-rose-600">{errors.businessName.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">Correo</label>
              <input
                type="email"
                className="field-base"
                {...register("email", { required: "Ingresa un correo válido" })}
              />
              {errors.email ? <p className="mt-2 text-sm text-rose-600">{errors.email.message}</p> : null}
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">Teléfono</label>
              <input className="field-base" {...register("telefono")} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-ink-700">Contraseña</label>
              <input
                type="password"
                className="field-base"
                {...register("password", {
                  required: "Crea una contraseña",
                  minLength: { value: 8, message: "Debe tener al menos 8 caracteres" }
                })}
              />
              {errors.password ? <p className="mt-2 text-sm text-rose-600">{errors.password.message}</p> : null}
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" className="w-full" loading={isSubmitting}>
                Crear cuenta y entrar
              </Button>
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-ink-500">
            ¿Ya tienes cuenta?{" "}
            <Link href="/auth/login" className="font-semibold text-brand-700 hover:text-brand-800">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
