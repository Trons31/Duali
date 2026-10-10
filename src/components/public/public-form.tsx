"use client";

import { useState } from "react";
import Link from "next/link";
import { FiArrowLeft, FiCheck, FiCopy, FiMessageCircle } from "react-icons/fi";
import { focusRing } from "@/components/public/public-shell";
import { cn } from "@/lib/web-utils";

// Piezas de los asistentes publicos (reservar, specs 009/012, y comprar plan, spec 021).

export const fieldClass =
  "w-full min-h-12 rounded-2xl border border-black/10 bg-white px-4 text-base text-ink-950 placeholder:text-ink-300 transition focus:border-ink-950 focus:outline-none focus:ring-4 focus:ring-black/5";

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </p>
  );
}

export function PrimaryButton({ children, disabled, loading, onClick }: { children: React.ReactNode; disabled?: boolean; loading?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink-950 px-6 text-base font-semibold text-white transition hover:bg-ink-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none" /> : null}
      {children}
    </button>
  );
}

/** "← Atrás · PASO 2 DE 3 · PAGO" con la barra de progreso. */
export function StepHeader({
  index,
  total,
  label,
  onBack,
  backHref
}: {
  index: number;
  total: number;
  label: string;
  onBack?: () => void;
  backHref: string;
}) {
  const back = `inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 text-sm font-medium text-ink-500 hover:text-ink-950 ${focusRing}`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {onBack ? (
          <button type="button" onClick={onBack} className={back}>
            <FiArrowLeft className="size-4" />
            Atrás
          </button>
        ) : (
          <Link href={backHref} className={back}>
            <FiArrowLeft className="size-4" />
            Volver
          </Link>
        )}
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-ink-400">
          Paso {index + 1} de {total} · {label}
        </span>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, item) => (
          <span key={item} className={cn("h-1 flex-1 rounded-full transition-colors", item <= index ? "bg-ink-950" : "bg-black/10")} />
        ))}
      </div>
    </div>
  );
}

export type PersonData = { celular: string; nombre: string; apellido: string };

export const isValidPerson = (person: PersonData) => person.celular.replace(/\D/g, "").length >= 7 && person.nombre.trim().length >= 2;

export function PersonFields({ value, onChange }: { value: PersonData; onChange: (value: PersonData) => void }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-600">Celular</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value.celular}
          onChange={(event) => onChange({ ...value, celular: event.target.value })}
          placeholder="300 000 0000"
          className={fieldClass}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-600">Nombre</span>
          <input autoComplete="given-name" value={value.nombre} onChange={(event) => onChange({ ...value, nombre: event.target.value })} className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-600">Apellido</span>
          <input autoComplete="family-name" value={value.apellido} onChange={(event) => onChange({ ...value, apellido: event.target.value })} className={fieldClass} />
        </label>
      </div>
      <p className="text-xs text-ink-500">Si ya eres clienta, usa el mismo celular y nombre.</p>
    </div>
  );
}

/**
 * Guardar un enlace privado (reserva, lista de espera o Mi plan): copiarlo o
 * mandarlo por WhatsApp (a si misma o a quien quiera).
 */
export function SaveLink({ path, title, description, shareText }: { path: string; title: string; description: string; shareText: string }) {
  const [copied, setCopied] = useState(false);
  const absolute = () => (typeof window === "undefined" ? path : `${window.location.origin}${path}`);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absolute());
      setCopied(true);
    } catch {
      // El enlace sigue disponible en el boton de abrir.
    }
  }

  return (
    <div className="rounded-3xl border border-dashed border-black/15 p-5 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-ink-500">{description}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={copyLink} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 font-medium ${focusRing}`}>
          {copied ? <FiCheck className="size-4" /> : <FiCopy className="size-4" />}
          {copied ? "Enlace copiado" : "Copiar enlace"}
        </button>
        <button
          type="button"
          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${absolute()}`)}`, "_blank", "noopener,noreferrer")}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 font-medium ${focusRing}`}
        >
          <FiMessageCircle className="size-4" />
          Guardar en WhatsApp
        </button>
      </div>
    </div>
  );
}
