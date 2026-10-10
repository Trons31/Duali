import Link from "next/link";
import { FiPackage } from "react-icons/fi";

/** Spec 002 R6: pantalla del estudio abierta con el modulo apagado. */
export function StudioModuleNotice({ title }: { title: string }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">{title}</h1>
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <FiPackage className="size-5" />
        </div>
        <h2 className="mt-4 font-semibold text-ink-800">Activa el módulo Estudio</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
          Paquetes de clases, disciplinas y reservas de cupos forman parte del módulo Estudio.
        </p>
        <Link
          href="/dashboard/ajustes"
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Ir a Ajustes
        </Link>
      </div>
    </div>
  );
}
