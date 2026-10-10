"use client";

import { useState } from "react";
import Link from "next/link";
import { FiCalendar, FiCheck, FiClock } from "react-icons/fi";
import { ErrorBox, PersonFields, PrimaryButton, SaveLink, StepHeader, isValidPerson, type PersonData } from "@/components/public/public-form";
import { PaymentStep, type PaymentMethod } from "@/components/public/public-payment";
import { focusRing } from "@/components/public/public-shell";
import type { OnlinePayment } from "@/lib/online-payments";
import { bookWithPlanHref, formatCop, myPlanHref, pricePerClass } from "@/lib/public-presentation";
import { dateKeyToDate } from "@/lib/studio-time";

type Step = "datos" | "pago" | "listo";
const STEP_LABELS: Record<Exclude<Step, "listo">, string> = { datos: "Tus datos", pago: "Pago" };

export type PurchasePlan = {
  id: string;
  nombre: string;
  clases: number;
  precio: number;
  vigenciaDias: number;
  discipline: { nombre: string; color: string };
  incluye: string[];
};

type Purchased = {
  accessToken: string;
  plan: { nombre: string; vence: string; situacionPago: string; puedeReservar: boolean; motivoNoReserva: string | null };
};

function formatLong(key: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "UTC" }).format(dateKeyToDate(key));
}

/** Spec 020 R13: renovar desde Mi plan; la identidad sale del enlace. */
export type RenewalContext = { token: string; nombre: string; inicio: string };

/**
 * Spec 021 D1/R1: comprar un plan sin pedir clase. Tus datos → Pago → Listo.
 * Al renovar (spec 020 R13) solo queda Pago → Listo.
 */
export function PlanPurchaseWizard({
  studio,
  plan,
  renewal
}: {
  studio: { slug: string; businessName: string; paymentMethods: PaymentMethod[]; permitirPagoEnEstudio: boolean; exigirPagoValidado: boolean };
  plan: PurchasePlan;
  renewal?: RenewalContext;
}) {
  const [step, setStep] = useState<Step>(renewal ? "pago" : "datos");
  const [person, setPerson] = useState<PersonData>({ celular: "", nombre: "", apellido: "" });
  const [payment, setPayment] = useState<OnlinePayment | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchased, setPurchased] = useState<Purchased | null>(null);
  const canSell = studio.paymentMethods.length > 0 || studio.permitirPagoEnEstudio;

  async function buy() {
    if (!payment) return;
    setSending(true);
    setError(null);
    try {
      const response = renewal
        ? await fetch(`/api/public/plans/${encodeURIComponent(renewal.token)}/renew`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pago: payment })
          })
        : await fetch(`/api/public/studios/${studio.slug}/plans`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ packageId: plan.id, celular: person.celular, nombre: person.nombre, apellido: person.apellido || null, pago: payment })
          });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "No pudimos completar la compra. Intenta de nuevo.");
      setPurchased(payload.data);
      setStep("listo");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (buyError) {
      setError((buyError as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (step === "listo" && purchased) {
    const inReview = purchased.plan.situacionPago === "EN_REVISION";
    return (
      <section className="space-y-6">
        <div className="rounded-[2rem] bg-ink-950 p-8 text-center text-white">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-white text-ink-950">
            <FiCheck className="size-7" />
          </span>
          <h1 className="mt-4 font-display text-5xl italic leading-none">{renewal ? "¡Plan renovado!" : "¡Tu plan está listo!"}</h1>
          <p className="mt-3 text-sm text-white/75">
            {purchased.plan.nombre} · {plan.clases === 1 ? "1 clase" : `${plan.clases} clases`} · vence el {formatLong(purchased.plan.vence)}
          </p>
        </div>

        <p className="flex gap-3 rounded-3xl bg-white p-5 text-sm text-ink-600 ring-1 ring-black/[0.06]">
          <FiClock className="mt-0.5 size-4 shrink-0" />
          <span>
            {inReview
              ? `Pago en revisión: ${studio.businessName} validará tu comprobante.`
              : `Pagas en el estudio: ${formatCop(plan.precio)}.`}{" "}
            {purchased.plan.puedeReservar ? "Ya puedes reservar tus clases." : purchased.plan.motivoNoReserva}
          </span>
        </p>

        {purchased.plan.puedeReservar ? (
          <Link
            href={bookWithPlanHref(studio.slug, purchased.accessToken)}
            className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink-950 px-6 text-base font-semibold text-white hover:bg-ink-800 ${focusRing}`}
          >
            <FiCalendar className="size-5" />
            Reservar mi primera clase
          </Link>
        ) : null}

        <SaveLink
          path={myPlanHref(studio.slug, purchased.accessToken)}
          title="Guarda tu enlace de Mi plan"
          description="Ahí ves cuántas clases te quedan, tus reservas y el estado de tu pago, y reservas sin volver a escribir tus datos."
          shareText={`Mi plan en ${studio.businessName}:`}
        />
        <Link href={myPlanHref(studio.slug, purchased.accessToken)} className={`block text-center text-sm font-medium underline underline-offset-4 ${focusRing}`}>
          Ver Mi plan
        </Link>
      </section>
    );
  }

  const steps: Array<Exclude<Step, "listo">> = renewal ? ["pago"] : ["datos", "pago"];
  const index = steps.indexOf(step as Exclude<Step, "listo">);
  const backHref = renewal ? myPlanHref(studio.slug, renewal.token) : `/s/${studio.slug}#planes`;

  return (
    <div className="space-y-6">
      <StepHeader
        index={index}
        total={steps.length}
        label={STEP_LABELS[step as Exclude<Step, "listo">]}
        backHref={backHref}
        onBack={index > 0 ? () => setStep(steps[index - 1]) : undefined}
      />

      <div className="flex items-center gap-4 rounded-3xl bg-white p-4 ring-1 ring-black/[0.06]">
        <span className="h-12 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: plan.discipline.color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {plan.nombre} · {plan.discipline.nombre}
          </span>
          <span className="block text-sm text-ink-500">
            {plan.clases === 1 ? "1 clase" : `${plan.clases} clases · ${formatCop(pricePerClass(plan))} c/u`} · {plan.vigenciaDias} días · {formatCop(plan.precio)}
          </span>
          {plan.incluye.length ? <span className="block truncate text-xs text-ink-400">Incluye {plan.incluye.join(", ")}</span> : null}
          {renewal ? (
            <span className="block text-xs text-ink-500">
              Renovación para {renewal.nombre} · empieza el {formatLong(renewal.inicio)}
            </span>
          ) : null}
        </span>
        {renewal ? null : (
          <Link href={`/s/${studio.slug}#planes`} className={`min-h-11 shrink-0 content-center rounded-full px-3 text-sm font-medium underline underline-offset-4 ${focusRing}`}>
            Cambiar
          </Link>
        )}
      </div>

      {step === "datos" ? (
        <section className="space-y-5">
          <h1 className="font-display text-5xl italic leading-none">Tus datos</h1>
          <PersonFields value={person} onChange={setPerson} />
          {!canSell ? <ErrorBox message="Este estudio aún no recibe pagos en línea. Escríbele para comprar tu plan." /> : null}
          <PrimaryButton disabled={!isValidPerson(person) || !canSell} onClick={() => setStep("pago")}>
            Continuar al pago
          </PrimaryButton>
        </section>
      ) : null}

      {step === "pago" ? (
        <section className="space-y-5">
          <h1 className="font-display text-5xl italic leading-none">{renewal ? "Renueva tu plan" : "Paga tu plan"}</h1>
          <p className="text-sm text-ink-500">
            Transfiere el valor y sube el comprobante. El estudio lo valida y tu plan queda pagado
            {studio.exigirPagoValidado ? "; podrás reservar cuando lo valide." : "; mientras tanto ya puedes reservar."}
          </p>
          <PaymentStep total={plan.precio} methods={studio.paymentMethods} allowInStudio={studio.permitirPagoEnEstudio} onChange={setPayment} />
          <ErrorBox message={error} />
          <PrimaryButton disabled={!payment} loading={sending} onClick={buy}>
            {renewal
              ? payment?.tipo === "EN_ESTUDIO"
                ? "Renovar y pagar en el estudio"
                : "Enviar comprobante y renovar"
              : payment?.tipo === "EN_ESTUDIO"
                ? "Comprar y pagar en el estudio"
                : "Enviar comprobante y comprar"}
          </PrimaryButton>
        </section>
      ) : null}
    </div>
  );
}
