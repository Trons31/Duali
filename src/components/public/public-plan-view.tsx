"use client";

import { useState } from "react";
import Link from "next/link";
import { FiCalendar, FiChevronRight } from "react-icons/fi";
import { ErrorBox, PrimaryButton, SaveLink } from "@/components/public/public-form";
import { PaymentStep } from "@/components/public/public-payment";
import { focusRing } from "@/components/public/public-shell";
import type { PublicPlan } from "@/lib/online-plans";
import type { OnlinePayment } from "@/lib/online-payments";
import { bookWithPlanHref, formatCop, myPlanHref } from "@/lib/public-presentation";
import { dateKeyToDate, formatTimeKey } from "@/lib/studio-time";
import { cn } from "@/lib/web-utils";

function formatDay(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-CO", { ...options, timeZone: "UTC" }).format(dateKeyToDate(key));
}

const PLAN_STATE: Record<PublicPlan["estado"], { label: string; className: string }> = {
  ACTIVO: { label: "Vigente", className: "bg-brand-50 text-brand-800" },
  AGOTADO: { label: "Sin clases", className: "bg-ink-100 text-ink-600" },
  VENCIDO: { label: "Vencido", className: "bg-rose-50 text-rose-700" },
  ANULADO: { label: "Anulado", className: "bg-ink-100 text-ink-500" }
};

const PAYMENT_TONE: Record<PublicPlan["situacionPago"], string> = {
  PAGADO: "bg-brand-50 text-brand-800",
  EN_REVISION: "bg-amber-50 text-amber-900",
  RECHAZADO: "bg-rose-50 text-rose-800",
  PAGO_EN_ESTUDIO: "bg-ink-100 text-ink-700",
  DEBE: "bg-amber-50 text-amber-900"
};

const BOOKING_STATE: Record<string, string> = {
  RESERVADA: "Reservada",
  ASISTIO: "Asistió",
  NO_ASISTIO: "No asistió",
  CANCELADA: "Cancelada"
};

/** Spec 021 R8: Mi plan, con el enlace privado. */
export function PublicPlanView({ token, initial }: { token: string; initial: PublicPlan }) {
  const [plan, setPlan] = useState(initial);
  const [payment, setPayment] = useState<OnlinePayment | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slug = plan.estudio.slug ?? "";
  const rejected = plan.comprobantes[0]?.estado === "RECHAZADO" ? plan.comprobantes[0] : null;
  const canSendReceipt = plan.puedeEnviarComprobante && plan.situacionPago !== "EN_REVISION" && plan.estudio.paymentMethods.length > 0;

  async function sendReceipt() {
    if (payment?.tipo !== "COMPROBANTE") return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/plans/${token}/receipts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comprobante: payment.comprobante, metodo: payment.metodo })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "No pudimos enviar el comprobante. Intenta de nuevo.");
      setPlan(result.data);
      setPayment(null);
    } catch (sendError) {
      setError((sendError as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-6 ring-1 ring-black/[0.06]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink-500">Hola, {plan.nombreCliente}</p>
            <h1 className="mt-1 font-display text-4xl italic leading-none">{plan.nombre}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-600">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: plan.discipline.color }} />
              {plan.discipline.nombre}
            </p>
            {plan.incluye.length ? <p className="mt-0.5 text-xs text-ink-400">Incluye {plan.incluye.join(", ")}</p> : null}
          </div>
          <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", PLAN_STATE[plan.estado].className)}>{PLAN_STATE[plan.estado].label}</span>
        </div>

        <div className="mt-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
            <p className="font-display text-3xl">
              {plan.clases === 1 ? (plan.clasesRestantes ? "Tienes 1 clase" : "Clase usada") : `Te quedan ${plan.clasesRestantes} de ${plan.clases}`}
            </p>
            <p className="text-sm text-ink-500">vence el {formatDay(plan.vence, { day: "numeric", month: "long" })}</p>
          </div>
          {plan.clases > 1 ? (
            <>
              <div className="mt-3 flex h-2 gap-px overflow-hidden rounded-full bg-black/[0.06]" aria-hidden>
                {plan.uso.asistio ? <span style={{ width: `${(plan.uso.asistio / plan.clases) * 100}%`, backgroundColor: plan.discipline.color }} /> : null}
                {plan.uso.falto ? <span className="bg-rose-400" style={{ width: `${(plan.uso.falto / plan.clases) * 100}%` }} /> : null}
                {plan.uso.reservadas ? <span className="bg-ink-300" style={{ width: `${(plan.uso.reservadas / plan.clases) * 100}%` }} /> : null}
              </div>
              <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-500">
                <span>{plan.uso.asistio} asististe</span>
                {plan.uso.falto ? <span>{plan.uso.falto} faltaste</span> : null}
                {plan.uso.reservadas ? <span>{plan.uso.reservadas} reservada{plan.uso.reservadas === 1 ? "" : "s"}</span> : null}
                <span>{plan.clasesRestantes} disponible{plan.clasesRestantes === 1 ? "" : "s"}</span>
              </p>
            </>
          ) : null}
        </div>

        <div className="mt-6">
          {plan.puedeReservar ? (
            <Link
              href={bookWithPlanHref(slug, token)}
              className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink-950 px-6 text-base font-semibold text-white hover:bg-ink-800 ${focusRing}`}
            >
              <FiCalendar className="size-5" />
              Reservar con este plan
            </Link>
          ) : plan.motivoNoReserva ? (
            <p className="rounded-2xl bg-sand px-4 py-3 text-sm text-ink-600">{plan.motivoNoReserva}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded-[2rem] bg-white p-6 ring-1 ring-black/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl italic">Pago</h2>
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", PAYMENT_TONE[plan.situacionPago])}>{plan.situacionPagoTexto}</span>
        </div>
        <p className="text-sm text-ink-600">
          {plan.saldo > 0 ? `${formatCop(plan.pagado)} pagado de ${formatCop(plan.precio)} · faltan ${formatCop(plan.saldo)}` : `${formatCop(plan.precio)} pagado`}
        </p>
        {plan.situacionPago === "EN_REVISION" ? <p className="text-sm text-ink-500">El estudio está revisando tu comprobante.</p> : null}
        {rejected ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            El estudio rechazó tu comprobante{rejected.motivoRechazo ? `: ${rejected.motivoRechazo}` : "."} Puedes enviar otro.
          </p>
        ) : null}
        {plan.pagos.length ? (
          <ul className="space-y-1 border-t border-black/[0.06] pt-3 text-sm">
            {plan.pagos.map((item, index) => (
              <li key={index} className="flex justify-between gap-2 text-ink-600">
                <span>{formatDay(item.fecha.slice(0, 10), { day: "numeric", month: "short" })}</span>
                <span className="font-semibold text-ink-900">{formatCop(item.monto)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {canSendReceipt ? (
          <div className="space-y-4 border-t border-black/[0.06] pt-4">
            <p className="font-semibold">Envía tu comprobante</p>
            <PaymentStep total={plan.saldo} methods={plan.estudio.paymentMethods} allowInStudio={false} onChange={setPayment} />
            <ErrorBox message={error} />
            <PrimaryButton disabled={payment?.tipo !== "COMPROBANTE"} loading={sending} onClick={sendReceipt}>
              Enviar comprobante
            </PrimaryButton>
          </div>
        ) : null}
      </section>

      {plan.proximas.length || plan.historial.length ? (
        <section className="space-y-4 rounded-[2rem] bg-white p-6 ring-1 ring-black/[0.06]">
          {plan.proximas.length ? (
            <div>
              <h2 className="font-display text-2xl italic">Próximas reservas</h2>
              <ul className="mt-3 divide-y divide-black/[0.06]">
                {plan.proximas.map((item) => (
                  <li key={`${item.fecha}-${item.horaInicio}`}>
                    <BookingLine item={item} slug={slug} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.historial.length ? (
            <div>
              <h2 className="font-display text-2xl italic">Historial</h2>
              <ul className="mt-3 divide-y divide-black/[0.06]">
                {plan.historial.map((item) => (
                  <li key={`${item.fecha}-${item.horaInicio}`}>
                    <BookingLine item={item} slug={slug} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <SaveLink
        path={myPlanHref(slug, token)}
        title="Guarda este enlace"
        description="Es tu acceso privado a Mi plan. No lo compartas: con él se reservan clases de tu plan."
        shareText={`Mi plan en ${plan.estudio.businessName}:`}
      />
    </div>
  );
}

function BookingLine({ item, slug }: { item: PublicPlan["proximas"][number]; slug: string }) {
  const body = (
    <>
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.discipline.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold first-letter:uppercase">
          {formatDay(item.fecha, { weekday: "short", day: "numeric", month: "short" })} · {item.discipline.nombre}
        </span>
        <span className="block text-xs text-ink-500">
          {formatTimeKey(item.horaInicio)} · {BOOKING_STATE[item.estado] ?? item.estado}
          {item.estado === "CANCELADA" ? (item.claseDevuelta ? " · clase devuelta" : " · sin devolución") : ""}
        </span>
      </span>
    </>
  );
  return item.enlace && item.estado === "RESERVADA" ? (
    <Link href={`/s/${slug}/reserva/${item.enlace}`} className={`flex min-h-14 items-center gap-3 py-2 ${focusRing}`}>
      {body}
      <span className="flex items-center text-xs font-medium text-ink-500">
        Gestionar
        <FiChevronRight className="size-4" />
      </span>
    </Link>
  ) : (
    <div className="flex min-h-14 items-center gap-3 py-2">{body}</div>
  );
}
