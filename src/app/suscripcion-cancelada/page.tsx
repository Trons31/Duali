import Link from "next/link";
import { FiAlertTriangle } from "react-icons/fi";

export const metadata = {
  title: "Suscripción cancelada"
};

export default function SubscriptionCancelledPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-mesh-brand px-4 py-10">
      <div className="shell-card w-full max-w-md px-6 py-10 text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-rose-50">
          <FiAlertTriangle className="size-8 text-rose-600" />
        </div>

        <h1 className="text-xl font-bold text-ink-950">Tu suscripción está cancelada</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          El acceso al sistema está bloqueado. Tus datos se conservan: al reactivar el plan vuelves a
          entrar con la misma cuenta y toda tu información sigue ahí.
        </p>

        <div className="mt-7 flex flex-col gap-2">
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700"
          >
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
