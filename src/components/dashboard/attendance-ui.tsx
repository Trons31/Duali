"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiCheck, FiX } from "react-icons/fi";
import { sileo } from "sileo";
import { useConfirm } from "@/components/ui/use-confirm";
import { clientApiFetch } from "@/lib/client-api";
import { cn } from "@/lib/web-utils";

type Estado = "RESERVADA" | "ASISTIO" | "NO_ASISTIO" | "CANCELADA";

const OPTIONS = [
  { value: "ASISTIO", label: "Asistió", icon: FiCheck, active: "border-brand-500 bg-brand-500 text-white" },
  { value: "NO_ASISTIO", label: "No asistió", icon: FiX, active: "border-rose-500 bg-rose-500 text-white" }
] as const;

/**
 * Botones ✓ / ✗ de asistencia (spec 019 R7). Tocar el marcado lo borra, con
 * confirmacion (R2). Si la politica del estudio devuelve la clase al faltar, el
 * aviso lo dice.
 */
export function AttendanceToggle({
  bookingId,
  estado,
  name,
  disabled = false,
  size = "md",
  onChanged
}: {
  bookingId: string;
  estado: Estado;
  name: string;
  disabled?: boolean;
  size?: "md" | "lg";
  onChanged: () => void | Promise<void>;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);

  async function mark(value: "ASISTIO" | "NO_ASISTIO") {
    const token = session?.user.apiToken;
    if (!token) return;
    const clearing = estado === value;
    if (clearing) {
      const ok = await confirm({
        title: "¿Borrar la asistencia?",
        description: `${name} quedará como reservada, sin asistencia marcada.`,
        notice: estado === "NO_ASISTIO" ? "Si se le había devuelto la clase por faltar, se le vuelve a descontar." : undefined,
        confirmText: "Borrar asistencia"
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const result = await clientApiFetch<{ devuelta?: boolean }>(`/api/bookings/${bookingId}`, token, {
        method: "PUT",
        body: JSON.stringify({ estado: clearing ? "RESERVADA" : value })
      });
      sileo.success({
        title: clearing
          ? "Asistencia borrada"
          : value === "ASISTIO"
            ? `${name} asistió`
            : result?.devuelta
              ? `${name} no asistió · se le devolvió la clase`
              : `${name} no asistió`
      });
      await onChanged();
      router.refresh();
    } catch (error) {
      sileo.error({ title: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = estado === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled || busy}
            aria-pressed={active}
            aria-label={`${option.label}: ${name}`}
            title={option.label}
            onClick={() => mark(option.value)}
            className={cn(
              "flex items-center justify-center rounded-xl border transition disabled:opacity-50",
              size === "lg" ? "size-11" : "size-8 rounded-lg",
              active ? option.active : "border-ink-200 bg-white text-ink-500 hover:bg-ink-50"
            )}
          >
            <Icon className={size === "lg" ? "size-5" : "size-3.5"} />
          </button>
        );
      })}
      {dialog}
    </div>
  );
}
