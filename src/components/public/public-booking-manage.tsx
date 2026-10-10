"use client";

import { useState } from "react";
import Link from "next/link";
import { FiCalendar, FiClock, FiCreditCard, FiUser, FiXCircle } from "react-icons/fi";
import { PublicConfirm } from "@/components/public/public-confirm";
import { ReceiptUploader } from "@/components/public/receipt-uploader";
import type { getPublicBooking } from "@/lib/public-studio";
import { dateKeyToDate, formatTimeKey, isBeforeCancellationDeadline } from "@/lib/studio-time";
import { cn, currency } from "@/lib/web-utils";

type Booking = NonNullable<Awaited<ReturnType<typeof getPublicBooking>>>;

const STATUS: Record<string, { label: string; tone: string }> = {
  RESERVADA: { label: "Cupo apartado", tone: "bg-ink-950 text-white" },
  ASISTIO: { label: "Asististe", tone: "bg-brand-100 text-brand-800" },
  NO_ASISTIO: { label: "No asististe", tone: "bg-black/5 text-ink-600" },
  CANCELADA: { label: "Cancelada", tone: "bg-rose-100 text-rose-800" }
};

/** Enlace privado de una reserva web (spec 009 R4): ver y cancelar. */
export function PublicBookingManage({ token, booking: initial }: { token: string; booking: Booking }) {
  const [booking, setBooking] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { clase } = booking;
  const status = clase.cancelada && booking.estado === "CANCELADA" ? { label: "Clase cancelada por el estudio", tone: STATUS.CANCELADA.tone } : STATUS[booking.estado];
  const onTime = isBeforeCancellationDeadline(clase.fecha, clase.horaInicio, booking.estudio.horasCancelacion);
  const canCancel = booking.estado === "RESERVADA" && !clase.cancelada;
  const when = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    dateKeyToDate(clase.fecha)
  );

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/bookings/${token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cancelar: true })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "No pudimos cancelar. Escríbele al estudio.");
      setBooking(payload.data);
      setResult(payload.data.claseDevuelta ? "Cancelada. Recuperaste tu clase." : "Cancelada. Como fue fuera de plazo, la clase no se devuelve.");
      setConfirming(false);
    } catch (cancelError) {
      setError((cancelError as Error).message);
      setConfirming(false);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", status.tone)}>{status.label}</span>
        <h1 className="mt-4 font-display text-5xl italic leading-none">Hola, {booking.nombre}</h1>
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
        {booking.saldo > 0 ? (
          <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
            <FiCreditCard className="size-4" />
            {booking.paquete}: por pagar {currency(booking.saldo)}
          </p>
        ) : null}
      </div>

      {booking.comprobantes.length || (booking.saldo > 0 && booking.estado !== "CANCELADA") ? (
        <div className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
          <p className="font-semibold">Comprobante de pago</p>
          {booking.comprobantes.map((receipt, index) => (
            <p key={index} className="flex items-center gap-2 text-sm text-ink-600">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  receipt.estado === "POR_REVISAR" ? "bg-amber-500" : receipt.estado === "APROBADO" ? "bg-brand-500" : "bg-rose-500"
                )}
              />
              {receipt.estado === "POR_REVISAR"
                ? "Enviado, en revisión"
                : receipt.estado === "APROBADO"
                  ? "Aprobado"
                  : `Rechazado${receipt.motivoRechazo ? `: ${receipt.motivoRechazo}` : ""}`}
            </p>
          ))}
          {booking.saldo > 0 && booking.estado !== "CANCELADA" ? <ReceiptUploader token={token} /> : null}
        </div>
      ) : null}

      {result ? <p role="status" className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">{result}</p> : null}
      {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      {canCancel ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-white text-sm font-semibold text-ink-700 transition hover:border-rose-300 hover:text-rose-700"
        >
          <FiXCircle className="size-4" />
          Cancelar mi reserva
        </button>
      ) : null}

      {/* Spec 019 R2: confirmacion en modal, diciendo si recupera la clase. */}
      <PublicConfirm
        open={confirming}
        title="¿Cancelar tu reserva?"
        confirmText="Sí, cancelar"
        loading={cancelling}
        onClose={() => setConfirming(false)}
        onConfirm={cancel}
      >
        <p className="capitalize">
          {clase.discipline.nombre} · {when} · {formatTimeKey(clase.horaInicio)}
        </p>
        <p className={cn("mt-3 rounded-2xl px-4 py-3", onTime ? "bg-brand-50 text-brand-800" : "bg-rose-50 text-rose-800")}>
          {onTime
            ? "Estás a tiempo: si cancelas recuperas la clase."
            : `Faltan menos de ${booking.estudio.horasCancelacion} h: si cancelas, la clase no se devuelve.`}
        </p>
      </PublicConfirm>

      <Link
        href={`/s/${booking.estudio.slug}/reservar`}
        className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-ink-950 text-base font-semibold text-white hover:bg-ink-800"
      >
        Reservar otra clase
      </Link>
    </div>
  );
}
