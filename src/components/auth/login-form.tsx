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
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-ink-950 px-14 py-14 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(57,212,157,.28),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(20,184,126,.16),transparent_38%)]" />

        <div className="relative max-w-xl">
          <div className="flex items-center gap-3">
            <BrandLogo size={38} priority className="rounded-xl shadow-none" />
            <span className="text-2xl font-black tracking-tight">Duali</span>
          </div>

          <h1 className="mt-10 text-5xl font-black leading-[1.08] tracking-tight">
            Gestiona tus cobros con una experiencia mas{" "}
            <span className="text-brand-400">simple</span>
          </h1>

          <p className="mt-6 max-w-md text-base leading-7 text-white/70">
            Entra a tu panel, revisa cobros, estudiantes, gastos y recordatorios desde un inicio de sesion limpio y
            seguro.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { icon: FiDollarSign, title: "Cobros", caption: "Pagos al dia" },
              { icon: FiUsers, title: "Estudiantes", caption: "Grupos y fichas" },
              { icon: FiShield, title: "Seguro", caption: "Acceso protegido" }
            ].map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <feature.icon className="size-5 text-brand-400" />
                <p className="mt-3 text-sm font-bold">{feature.title}</p>
                <p className="mt-1 text-xs text-white/55">{feature.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <div className="mb-4 flex justify-center">
              <BrandLogo size={68} priority />
            </div>
            <h1 className="text-3xl font-black text-ink-950">Duali</h1>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-7 shadow-card sm:p-8">
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
        </div>
      </section>
    </div>
  );
}
