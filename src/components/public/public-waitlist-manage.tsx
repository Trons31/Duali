"use client";

import { useState } from "react";
import Link from "next/link";
import { FiCalendar, FiClock, FiUser, FiXCircle } from "react-icons/fi";
import { PublicConfirm } from "@/components/public/public-confirm";
import { focusRing } from "@/components/public/public-shell";
import type { PublicWaitlistEntry } from "@/lib/waitlist";
import { dateKeyToDate, formatTimeKey } from "@/lib/studio-time";
import { cn } from "@/lib/web-utils";

function statusOf(entry: PublicWaitlistEntry) {
  if (entry.clase.cancelada) return { label: "Clase cancelada por el estudio", tone: "bg-rose-100 text-rose-800" };
  if (entry.estado === "ASIGNADA") return { label: "Ya tienes cupo", tone: "bg-brand-100 text-brand-800" };
  if (entry.estado === "SALIO") return { label: "Saliste de la lista", tone: "bg-black/5 text-ink-600" };
  if (entry.clase.empezo) return { label: "La clase empezó sin cupo libre", tone: "bg-black/5 text-ink-600" };
  return { label: `En lista de espera · puesto ${entry.posicion}`, tone: "bg-ink-950 text-white" };
}

/** Enlace privado de la lista de espera (spec 015 R2 y W3): ver el puesto y salir. */
export function PublicWaitlistManage({ token, entry: initial }: { token: string; entry: PublicWaitlistEntry }) {
  const [entry, setEntry] = useState(initial);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { clase } = entry;
  const status = statusOf(entry);
  const canLeave = entry.estado === "EN_ESPERA" && !clase.cancelada && !clase.empezo;
  const when = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    dateKeyToDate(clase.fecha)
  );

  async function leave() {
    setLeaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/waitlist/${token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ salir: true })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "No pudimos sacarte de la lista. Escríbele al estudio.");
      setEntry(payload.data);
      setConfirmLeave(false);
    } catch (leaveError) {
      setError((leaveError as Error).message);
      setConfirmLeave(false);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", status.tone)}>{status.label}</span>
        <h1 className="mt-4 font-display text-5xl italic leading-none">Hola, {entry.nombre}</h1>
      </div>

      <div className="space-y-3 rounded-3xl border-l-4 bg-white p-6 ring-1 ring-black/[0.06]" style={{ borderLeftColor: clase.discipline.color }}>
        <p className="font-display text-3xl italic leading-none">{clase.discipline.nombre}</p>
        <p className="flex items-center gap-2 text-sm capitalize text-ink-600">
          <FiCalendar className="size-4 text-ink-400" />
          {when}
        </p>
        <p className="flex items-center gap-2 text-sm text-ink-600">
          <FiClock className="size-4 text-ink-400" />
          {formatTimeKey(clase.horaInicio)} · {clase.duracionMin} min
        </p>
        {clase.instructor ? (
          <p className="flex items-center gap-2 text-sm text-ink-600">
            <FiUser className="size-4 text-ink-400" />
            {clase.instructor}
          </p>
        ) : null}
      </div>

      {entry.estado === "EN_ESPERA" && !clase.cancelada && !clase.empezo ? (
        <p className="rounded-3xl bg-white p-5 text-sm text-ink-600 ring-1 ring-black/[0.06]">
          Si alguien cancela con más de {entry.estudio.horasCancelacion} h de anticipación, el cupo pasa solo a quien esté de primero en
          la lista y el estudio te avisa por WhatsApp. Mientras esperas no se te cobra nada.
        </p>
      ) : null}
      {entry.estado === "ASIGNADA" ? (
        <p className="rounded-3xl bg-white p-5 text-sm text-ink-600 ring-1 ring-black/[0.06]">El estudio te asignó un cupo en esta clase.</p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {canLeave ? (
        <button
          type="button"
          onClick={() => setConfirmLeave(true)}
          disabled={leaving}
          className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-white text-sm font-semibold text-ink-700 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-60 ${focusRing}`}
        >
          <FiXCircle className="size-4" />
          {leaving ? "Saliendo…" : "Salir de la lista de espera"}
        </button>
      ) : null}

      {/* Spec 019 R2: salir de la lista se confirma; pierde el puesto. */}
      <PublicConfirm
        open={confirmLeave}
        title="¿Salir de la lista?"
        confirmText="Sí, salir"
        loading={leaving}
        onClose={() => setConfirmLeave(false)}
        onConfirm={leave}
      >
        Pierdes tu puesto {entry.posicion ? `(número ${entry.posicion}) ` : ""}en la lista de {clase.discipline.nombre}. Si vuelves a anotarte,
        quedas de última.
      </PublicConfirm>

      <Link
        href={`/s/${entry.estudio.slug}/reservar`}
        className={`inline-flex min-h-14 w-full items-center justify-center rounded-full bg-ink-950 text-base font-semibold text-white hover:bg-ink-800 ${focusRing}`}
      >
        Ver otras clases
      </Link>
    </div>
  );
}
