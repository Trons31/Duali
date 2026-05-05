"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { sileo } from "sileo";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";

type LoginFormValues = {
  email: string;
  password: string;
};

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: "",
      password: ""
    }
  });

  async function onSubmit(values: LoginFormValues) {
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false
    });

    if (result?.error) {
      sileo.error({ title: "Correo o contraseña incorrectos" });
      return;
    }

    sileo.success({ title: "Bienvenido a Duali" });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-ink-950 px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(57,212,157,.34),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(20,184,126,.18),transparent_30%)]" />
        <div className="relative">
          <div className="flex items-center gap-4">
            <BrandLogo size={62} priority className="shadow-none" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-300">Duali web</p>
              <h1 className="text-3xl font-black">Controla tu operación desde cualquier pantalla.</h1>
            </div>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-4xl font-black leading-tight">
            Cobros, estudiantes, gastos y recordatorios del administrador en una sola experiencia.
          </p>
          <p className="mt-5 text-base leading-7 text-white/76">
            Pensado mobile-first para iPhone, Android y escritorio. Instalable, rápido y con seguimiento de
            notificaciones desde el navegador.
          </p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <div className="mb-4 flex justify-center">
              <BrandLogo size={68} priority />
            </div>
            <h1 className="text-3xl font-black text-ink-950">Duali</h1>
            <p className="mt-2 text-sm text-ink-500">Tu negocio educativo ahora también vive completo en web.</p>
          </div>

          <div className="shell-card p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Acceso seguro</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-ink-950">Inicia sesión</h2>
            <p className="mt-2 text-sm text-ink-500">Entra a tu panel para revisar cobros, notificaciones y métricas.</p>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Correo</label>
                <input
                  type="email"
                  className="field-base"
                  placeholder="tu@correo.com"
                  {...register("email", { required: "Ingresa tu correo" })}
                />
                {errors.email ? <p className="mt-2 text-sm text-rose-600">{errors.email.message}</p> : null}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="field-base pr-12"
                    placeholder="••••••••"
                    {...register("password", { required: "Ingresa tu contraseña" })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    {showPassword ? <FiEyeOff className="size-4" /> : <FiEye className="size-4" />}
                  </button>
                </div>
                {errors.password ? <p className="mt-2 text-sm text-rose-600">{errors.password.message}</p> : null}
              </div>

              <Button type="submit" className="mt-2 w-full" loading={isSubmitting}>
                Entrar al dashboard
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-ink-500">
              ¿Aún no tienes cuenta?{" "}
              <Link href="/auth/register" className="font-semibold text-brand-700 hover:text-brand-800">
                Crea tu cuenta
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
