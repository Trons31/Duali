"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { FiArrowRight, FiDollarSign, FiEye, FiEyeOff, FiLock, FiMail, FiShield, FiUsers } from "react-icons/fi";
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
    <main className="relative min-h-[100svh] overflow-hidden bg-ink-950 text-white lg:h-[100svh] lg:min-h-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(57,212,157,.28),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(20,184,126,.18),transparent_40%)]" />
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(57, 212, 157, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(57, 212, 157, 0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px"
        }}
      />
      <FiDollarSign className="absolute right-8 top-20 size-24 rotate-12 text-brand-400/10 md:right-20 md:top-28 md:size-32" />
      <FiUsers className="absolute bottom-20 left-8 size-16 -rotate-12 text-brand-400/10 md:left-20" />

      <div className="relative z-10 mx-auto grid min-h-[100svh] w-full max-w-6xl items-center gap-10 px-4 py-8 lg:h-full lg:min-h-0 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-6 lg:py-6">
        <section className="hidden lg:block">
          <div className="flex items-center gap-3">
            <BrandLogo size={38} priority className="rounded-xl shadow-none" />
            <span className="text-2xl font-black tracking-tight">Duali</span>
          </div>

          <div className="mt-10 max-w-xl">
            <h1 className="text-5xl font-black leading-[1.02] tracking-tight">
              Gestiona tus cobros con una experiencia más{" "}
              <span className="bg-gradient-to-r from-brand-300 to-brand-200 bg-clip-text text-transparent">simple</span>
            </h1>

            <p className="mt-5 max-w-md text-base leading-7 text-white/70">
              Entra a tu panel, revisa cobros, estudiantes, gastos y recordatorios desde un inicio de sesión limpio y
              seguro.
            </p>

            <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              {[
                { icon: FiDollarSign, title: "Cobros", caption: "Pagos al día" },
                { icon: FiUsers, title: "Estudiantes", caption: "Grupos y fichas" },
                { icon: FiShield, title: "Seguro", caption: "Acceso protegido" }
              ].map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <feature.icon className="size-5 text-brand-300" />
                  <p className="mt-3 text-sm font-bold">{feature.title}</p>
                  <p className="mt-1 text-xs text-white/55">{feature.caption}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-7 text-center lg:hidden">
            <div className="mb-4 flex justify-center">
              <BrandLogo size={60} priority />
            </div>
            <h1 className="text-3xl font-black text-white">Duali</h1>
            <p className="mt-1 text-sm text-white/60">Gestión de cobros y estudiantes</p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white p-7 text-ink-950 shadow-lg shadow-brand-950/20 sm:p-8 md:shadow-2xl md:shadow-brand-950/30 lg:p-7">
            <h2 className="text-2xl font-black tracking-tight text-ink-950">Inicia sesión</h2>
            <p className="mt-1.5 text-sm text-ink-500">Entra con tu correo y contraseña de Duali.</p>

            <form className="mt-7 space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-800">Correo</label>
                <div className="relative">
                  <FiMail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                  <input
                    type="email"
                    className="field-base pl-11"
                    placeholder="tu@correo.com"
                    {...register("email", { required: "Ingresa tu correo" })}
                  />
                </div>
                {errors.email ? <p className="mt-2 text-sm text-rose-600">{errors.email.message}</p> : null}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-800">Contraseña</label>
                <div className="relative">
                  <FiLock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    className="field-base pl-11 pr-12"
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
                Continuar
                <FiArrowRight className="size-4" />
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-ink-500">
              ¿No tienes cuenta?{" "}
              <Link href="/auth/register" className="font-semibold text-brand-700 hover:text-brand-800">
                Crear cuenta
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
