"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiCheck, FiClock, FiCopy, FiExternalLink, FiMessageCircle } from "react-icons/fi";
import { ErrorBox, PersonFields, PrimaryButton, SaveLink, StepHeader, isValidPerson, type PersonData } from "@/components/public/public-form";
import { PaymentStep } from "@/components/public/public-payment";
import { focusRing } from "@/components/public/public-shell";
import { ReceiptUploader } from "@/components/public/receipt-uploader";
import { ScrollHint } from "@/components/shared/scroll-hint";
import type { OnlinePayment, PaymentState } from "@/lib/online-payments";
import type { PublicSession } from "@/lib/public-studio";
import { formatCop, myPlanHref, pricePerClass, purchaseHref } from "@/lib/public-presentation";
import { WEEKDAYS, dateKeyToDate, formatTimeKey, isoWeekday } from "@/lib/studio-time";
import { cn } from "@/lib/web-utils";

type Step = "clase" | "datos" | "confirmar" | "paquete" | "pago" | "listo";

type Option = { id: string; nombre: string; clases: number; precio: number; discipline: { nombre: string; color: string } };

/** Lo que la clienta ve de su plan (spec 021 R5). */
type PlanSummary = {
  nombre: string;
  discipline: string;
  clases: number;
  clasesRestantes: number;
  vence: string;
  saldo: number;
  situacionPago: PaymentState;
  miPlan: string | null;
};

type Booked = { accessToken: string; paquete: PlanSummary };

type Waiting = { accessToken: string; posicion: number };

const STEP_LABELS: Record<Step, string> = {
  clase: "Clase",
  datos: "Tus datos",
  confirmar: "Confirmar",
  paquete: "Tu plan",
  pago: "Pago",
  listo: "Listo"
};

type Studio = {
  slug: string;
  businessName: string;
  telefono: string | null;
  horasCancelacion: number;
  paymentMethods: Array<{ name: string; account: string }>;
  permitirPagoEnEstudio: boolean;
  exigirPagoValidado: boolean;
};

function formatDay(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-CO", { ...options, timeZone: "UTC" }).format(dateKeyToDate(key));
}

/**
 * Reserva publica (specs 009, 012 y 021). Desde una clase de la pagina entra
 * directo a "Tus datos" (?h&f); desde Mi plan (?mp) no pide datos y reserva con
 * ese plan. Antes de reservar muestra el plan que se usara; sin plan, se elige
 * uno y se paga en el mismo camino. Si la clase esta llena, anota en la lista de
 * espera (spec 015 R6).
 */
export function PublicBookingWizard({
  studio,
  sessions,
  today,
  initial,
  planToken
}: {
  studio: Studio;
  sessions: PublicSession[];
  today: string;
  initial?: { scheduleId?: string; fecha?: string };
  /** Spec 021 R9: reservar desde Mi plan. */
  planToken?: string;
}) {
  const preselected = sessions.find((session) => session.scheduleId === initial?.scheduleId && session.fecha === initial?.fecha);
  const days = useMemo(() => [...new Set(sessions.map((session) => session.fecha))], [sessions]);
  const [step, setStep] = useState<Step>(preselected && !planToken ? "datos" : "clase");
  const [day, setDay] = useState(preselected?.fecha ?? days[0] ?? today);
  const [session, setSession] = useState<PublicSession | null>(preselected ?? null);
  const [person, setPerson] = useState<PersonData>({ celular: "", nombre: "", apellido: "" });
  const [preview, setPreview] = useState<PlanSummary | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [mustBuyFirst, setMustBuyFirst] = useState(false);
  const [packageId, setPackageId] = useState("");
  const [payment, setPayment] = useState<OnlinePayment | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const waitlist = Boolean(session && session.cuposLibres <= 0);
  const steps: Step[] = planToken
    ? ["clase", "confirmar"]
    : waitlist
      ? options.length
        ? ["clase", "datos", "paquete"]
        : ["clase", "datos"]
      : preview
        ? ["clase", "datos", "confirmar"]
        : options.length
          ? mustBuyFirst
            ? ["clase", "datos", "paquete"]
            : ["clase", "datos", "paquete", "pago"]
          : ["clase", "datos"];
  const stepIndex = Math.max(steps.indexOf(step), 0);
  const chosen = options.find((item) => item.id === packageId) ?? null;

  function identity() {
    return planToken
      ? { planToken }
      : { celular: person.celular, nombre: person.nombre, apellido: person.apellido || null };
  }

  async function post(target: PublicSession, body: Record<string, unknown>, asWaitlist = false) {
    const response = await fetch(`/api/public/studios/${studio.slug}/${asWaitlist ? "waitlist" : "bookings"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduleId: target.scheduleId, fecha: target.fecha, ...identity(), ...body })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error ?? (asWaitlist ? "No pudimos anotarte. Intenta de nuevo." : "No pudimos apartar tu cupo. Intenta de nuevo."));
    }
    return payload.data;
  }

  function needsPackage(data: { opciones: Option[]; exigePagoValidado: boolean }) {
    if (!data.opciones.length) throw new Error("Esta clase no tiene planes a la venta en línea. Escríbele al estudio.");
    setOptions(data.opciones);
    setMustBuyFirst(!waitlist && data.exigePagoValidado);
    // Por defecto la clase suelta: es lo que se compra para una sola clase.
    setPackageId((data.opciones.find((item) => item.clases === 1) ?? data.opciones[0]).id);
    setStep("paquete");
  }

  function finish(data: Booked | Waiting, kind: "booked" | "waiting") {
    if (kind === "waiting") setWaiting(data as Waiting);
    else setBooked(data as Booked);
    setStep("listo");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Despues de los datos (o al elegir clase desde Mi plan): que plan se usaria. */
  async function check(target: PublicSession | null = session) {
    if (!target) return;
    setSending(true);
    setError(null);
    try {
      const targetIsFull = target.cuposLibres <= 0;
      if (targetIsFull && !planToken) {
        const data = await post(target, {}, true);
        if (data.estado === "NECESITA_PAQUETE") needsPackage(data);
        else finish(data, "waiting");
        return;
      }
      const data = await post(target, { vistaPrevia: true }, targetIsFull);
      if (data.estado === "NECESITA_PAQUETE") needsPackage(data);
      else if (data.estado === "EN_ESPERA") finish(data, "waiting");
      else if (data.plan) {
        setPreview(data.plan);
        setStep("confirmar");
      } else throw new Error("No encontramos un plan para esta clase. Escríbele al estudio.");
    } catch (checkError) {
      setError((checkError as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function book(body: Record<string, unknown> = {}) {
    if (!session) return;
    setSending(true);
    setError(null);
    try {
      const data = await post(session, body, waitlist);
      if (data.estado === "NECESITA_PAQUETE") needsPackage(data);
      else finish(data, data.estado === "EN_ESPERA" ? "waiting" : "booked");
    } catch (bookError) {
      setError((bookError as Error).message);
    } finally {
      setSending(false);
    }
  }

  function goBack() {
    setError(null);
    setStep(steps[Math.max(stepIndex - 1, 0)]);
  }

  function choose(item: PublicSession) {
    setSession(item);
    setPreview(null);
    setOptions([]);
    setPayment(null);
    if (planToken) void check(item);
    else setStep("datos");
  }

  if (!sessions.length) {
    return (
      <div className="rounded-3xl border border-black/[0.06] bg-white p-8 text-center">
        <p className="font-display text-3xl italic">Sin clases por ahora</p>
        <p className="mt-2 text-sm text-ink-500">
          {planToken ? "No hay clases próximas donde sirva tu plan." : "Vuelve pronto o escríbele al estudio."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {step !== "listo" ? (
        <StepHeader
          index={stepIndex}
          total={steps.length}
          label={STEP_LABELS[step]}
          backHref={planToken ? myPlanHref(studio.slug, planToken) : `/s/${studio.slug}`}
          onBack={stepIndex > 0 ? goBack : undefined}
        />
      ) : null}

      {step === "clase" ? (
        <section className="space-y-5">
          <h1 className="font-display text-5xl italic leading-none">Elige tu clase</h1>
          <ScrollHint className="-mx-4" scrollerClassName="flex gap-2 px-4 pb-1" role="tablist" aria-label="Días">
            {days.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={day === key}
                onClick={() => setDay(key)}
                className={cn(
                  "flex min-h-[4.5rem] min-w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-2xl border px-3 transition",
                  day === key ? "border-ink-950 bg-ink-950 text-white" : "border-black/[0.08] bg-white text-ink-700 hover:border-black/20",
                  focusRing
                )}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{key === today ? "Hoy" : WEEKDAYS[isoWeekday(key) - 1].short}</span>
                <span className="font-display text-3xl leading-none">{formatDay(key, { day: "numeric" })}</span>
              </button>
            ))}
          </ScrollHint>
          <ul className="space-y-3">
            {sessions
              .filter((item) => item.fecha === day)
              .map((item) => {
                const full = item.cuposLibres <= 0;
                return (
                  <li key={`${item.scheduleId}-${item.fecha}`}>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => choose(item)}
                      className={`flex w-full items-center gap-4 rounded-3xl border border-black/[0.06] bg-white p-4 text-left transition hover:border-black/20 disabled:opacity-60 ${focusRing}`}
                    >
                      <span className="w-16 shrink-0 text-center">
                        <span className="block font-display text-3xl leading-none">{formatTimeKey(item.horaInicio).split(" ")[0]}</span>
                        <span className="mt-1 block text-[11px] font-semibold uppercase text-ink-400">{formatTimeKey(item.horaInicio).split(" ").slice(1).join(" ")}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 truncate font-semibold">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.discipline.color }} />
                          {item.discipline.nombre}
                        </span>
                        {item.instructor ? <span className="block text-xs text-ink-500">{item.instructor}</span> : null}
                      </span>
                      <span className={cn("shrink-0 text-right text-xs font-semibold", full ? "text-ink-500" : item.cuposLibres <= 3 ? "text-amber-700" : "text-ink-600")}>
                        {full ? (
                          <>
                            Lleno
                            <span className="block font-normal">lista de espera</span>
                          </>
                        ) : item.cuposLibres === 1 ? (
                          "Queda 1"
                        ) : (
                          `${item.cuposLibres} cupos`
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
          <ErrorBox message={error} />
        </section>
      ) : null}

      {step === "datos" && session ? (
        <section className="space-y-5">
          <SessionSummary session={session} onChange={() => setStep("clase")} />
          <h1 className="font-display text-5xl italic leading-none">Tus datos</h1>
          <PersonFields value={person} onChange={setPerson} />
          {waitlist ? <WaitlistNotice horasCancelacion={studio.horasCancelacion} /> : null}
          <ErrorBox message={error} />
          <PrimaryButton disabled={!isValidPerson(person)} loading={sending} onClick={() => check()}>
            {waitlist ? "Unirme a la lista de espera" : "Continuar"}
          </PrimaryButton>
        </section>
      ) : null}

      {step === "confirmar" && session && preview ? (
        <section className="space-y-5">
          <SessionSummary session={session} onChange={() => setStep("clase")} />
          <h1 className="font-display text-5xl italic leading-none">Confirma tu reserva</h1>
          <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
            <p className="text-sm text-ink-500">Tu plan</p>
            <p className="font-display text-2xl italic">
              {preview.nombre} · {preview.discipline}
            </p>
            <p className="mt-1 text-sm text-ink-700">
              {preview.clases === 1
                ? "Clase suelta"
                : `Te quedan ${preview.clasesRestantes} de ${preview.clases} · vence el ${formatDay(preview.vence, { day: "numeric", month: "long" })}`}
            </p>
            {preview.clases > 1 ? (
              <p className="mt-3 rounded-2xl bg-sand px-4 py-3 text-sm font-medium">
                Después de esta reserva te {preview.clasesRestantes - 1 === 1 ? "quedará 1 clase" : `quedarán ${preview.clasesRestantes - 1} clases`}.
              </p>
            ) : null}
            {preview.situacionPago === "EN_REVISION" ? <p className="mt-3 text-xs text-ink-500">Tu pago está en revisión; igual puedes reservar.</p> : null}
          </div>
          <ErrorBox message={error} />
          <PrimaryButton loading={sending} onClick={() => book()}>
            Reservar con mi plan
          </PrimaryButton>
        </section>
      ) : null}

      {step === "paquete" && session ? (
        <section className="space-y-5">
          <SessionSummary session={session} />
          <div>
            <h1 className="font-display text-5xl italic leading-none">Tu plan</h1>
            <p className="mt-2 text-sm text-ink-500">
              {waitlist
                ? "Aún no tienes un plan para esta clase. Si te llega el cupo, se reserva con este plan y lo pagas después."
                : mustBuyFirst
                  ? "Aún no tienes un plan para esta clase. Este estudio valida el pago antes de reservar: compra tu plan y reserva cuando lo aprueben."
                  : "Aún no tienes un plan para esta clase. Elige uno y págalo en el siguiente paso."}
            </p>
          </div>
          <ul className="space-y-3">
            {options.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={packageId === item.id}
                  onClick={() => setPackageId(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-3xl border-2 bg-white p-5 text-left transition",
                    packageId === item.id ? "border-ink-950" : "border-transparent ring-1 ring-black/[0.06] hover:ring-black/20",
                    focusRing
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-display text-2xl italic leading-none">{item.nombre}</span>
                    <span className="mt-1 block text-xs text-ink-500">
                      {item.discipline.nombre} · {item.clases === 1 ? "solo esta clase" : `${item.clases} clases · ${formatCop(pricePerClass(item))} c/u`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xl font-semibold">{formatCop(item.precio)}</span>
                    <span className={cn("flex size-6 items-center justify-center rounded-full border", packageId === item.id ? "border-ink-950 bg-ink-950 text-white" : "border-black/15")}>
                      {packageId === item.id ? <FiCheck className="size-3.5" /> : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <ErrorBox message={error} />
          {waitlist ? (
            <PrimaryButton disabled={!packageId} loading={sending} onClick={() => book({ packageId })}>
              Unirme a la lista de espera
            </PrimaryButton>
          ) : mustBuyFirst ? (
            <Link
              href={purchaseHref(studio.slug, packageId)}
              className={`inline-flex min-h-14 w-full items-center justify-center rounded-full bg-ink-950 px-6 text-base font-semibold text-white hover:bg-ink-800 ${focusRing}`}
            >
              Comprar este plan
            </Link>
          ) : (
            <PrimaryButton disabled={!packageId} onClick={() => setStep("pago")}>
              Continuar al pago
            </PrimaryButton>
          )}
        </section>
      ) : null}

      {step === "pago" && session && chosen ? (
        <section className="space-y-5">
          <SessionSummary session={session} />
          <h1 className="font-display text-5xl italic leading-none">Paga y reserva</h1>
          <p className="text-sm text-ink-500">
            {chosen.nombre} · {chosen.discipline.nombre}. Transfiere el valor y sube el comprobante; el estudio lo valida.
          </p>
          <PaymentStep total={chosen.precio} methods={studio.paymentMethods} allowInStudio={studio.permitirPagoEnEstudio} onChange={setPayment} />
          <ErrorBox message={error} />
          <PrimaryButton disabled={!payment} loading={sending} onClick={() => book({ packageId, pago: payment })}>
            {payment?.tipo === "EN_ESTUDIO" ? "Apartar y pagar en el estudio" : "Enviar comprobante y reservar"}
          </PrimaryButton>
        </section>
      ) : null}

      {step === "listo" && session && booked ? <Confirmation studio={studio} session={session} booked={booked} nombre={person.nombre} /> : null}
      {step === "listo" && session && waiting ? <WaitlistConfirmation studio={studio} session={session} waiting={waiting} /> : null}
    </div>
  );
}

function SessionSummary({ session, onChange }: { session: PublicSession; onChange?: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-white p-4 ring-1 ring-black/[0.06]">
      <span className="h-12 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: session.discipline.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{session.discipline.nombre}</span>
        <span className="block text-sm first-letter:uppercase text-ink-500">
          {formatDay(session.fecha, { weekday: "long", day: "numeric", month: "long" })} · {formatTimeKey(session.horaInicio)}
        </span>
      </span>
      {onChange ? (
        <button type="button" onClick={onChange} className={`min-h-11 shrink-0 rounded-full px-3 text-sm font-medium underline underline-offset-4 ${focusRing}`}>
          Cambiar
        </button>
      ) : null}
    </div>
  );
}

function WaitlistNotice({ horasCancelacion }: { horasCancelacion: number }) {
  return (
    <p className="flex gap-3 rounded-2xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-ink-600">
      <FiClock className="mt-0.5 size-4 shrink-0" />
      <span>
        Esta clase está llena. Si alguien cancela con más de {horasCancelacion} h de anticipación, el cupo pasa solo a quien esté de
        primero en la lista y el estudio te avisa. No se te cobra nada mientras esperas.
      </span>
    </p>
  );
}

function WaitlistConfirmation({ studio, session, waiting }: { studio: { slug: string }; session: PublicSession; waiting: Waiting }) {
  const link = `/s/${studio.slug}/espera/${waiting.accessToken}`;
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${link}`);
      setCopied(true);
    } catch {
      // El enlace sigue disponible en el boton de abajo.
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-ink-950 p-8 text-center text-white">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-white font-display text-3xl italic text-ink-950">
          {waiting.posicion}
        </span>
        <h1 className="mt-4 font-display text-5xl italic leading-none">Estás en la lista</h1>
        <p className="mt-3 text-sm text-white/75">
          Puesto {waiting.posicion} en espera para {session.discipline.nombre} ·{" "}
          <span>{formatDay(session.fecha, { weekday: "long", day: "numeric", month: "long" })}</span> a las{" "}
          {formatTimeKey(session.horaInicio)}
        </p>
      </div>
      <div className="rounded-3xl border border-dashed border-black/15 p-5 text-sm">
        <p className="font-semibold">Guarda este enlace</p>
        <p className="mt-1 text-ink-500">Ahí ves tu puesto y si ya te llegó el cupo, o puedes salir de la lista.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={copyLink} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 font-medium ${focusRing}`}>
            {copied ? <FiCheck className="size-4" /> : <FiCopy className="size-4" />}
            {copied ? "Enlace copiado" : "Copiar enlace"}
          </button>
          <Link href={link} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 font-medium underline underline-offset-4 ${focusRing}`}>
            Ver mi lugar
            <FiExternalLink className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Confirmation({ studio, session, booked, nombre }: { studio: Studio; session: PublicSession; booked: Booked; nombre: string }) {
  const [copied, setCopied] = useState(false);
  const plan = booked.paquete;
  const manageUrl =
    typeof window === "undefined" ? `/s/${studio.slug}/reserva/${booked.accessToken}` : `${window.location.origin}/s/${studio.slug}/reserva/${booked.accessToken}`;
  const when = `${formatDay(session.fecha, { weekday: "long", day: "numeric", month: "long" })} a las ${formatTimeKey(session.horaInicio)}`;
  const greeting = nombre.trim() ? `Hola ${studio.businessName}, soy ${nombre.trim()}.` : `Hola ${studio.businessName}.`;
  const message = [
    greeting,
    `Aparté cupo en ${session.discipline.nombre} el ${when}.`,
    plan.situacionPago === "PAGO_EN_ESTUDIO" ? `Plan: ${plan.nombre} (${formatCop(plan.saldo)}), lo pago en el estudio.` : null,
    `Mi reserva: ${manageUrl}`
  ]
    .filter(Boolean)
    .join("\n");
  const digits = studio.telefono?.replace(/\D/g, "") ?? "";
  const whatsapp = digits ? `https://wa.me/${digits.length === 10 ? `57${digits}` : digits}?text=${encodeURIComponent(message)}` : null;
  // Con pago en el estudio aun puede adjuntar el comprobante si transfiere (spec 014).
  const canAttach = plan.situacionPago === "PAGO_EN_ESTUDIO" || plan.situacionPago === "DEBE";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(manageUrl);
      setCopied(true);
    } catch {
      // El enlace sigue visible abajo.
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-ink-950 p-8 text-center text-white">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-white text-ink-950">
          <FiCheck className="size-7" />
        </span>
        <h1 className="mt-4 font-display text-5xl italic leading-none">¡Cupo apartado!</h1>
        <p className="mt-3 text-sm first-letter:uppercase text-white/75">
          {session.discipline.nombre} · {when}
        </p>
      </div>

      <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
        <p className="text-sm text-ink-500">Tu plan</p>
        <p className="font-display text-2xl italic">
          {plan.nombre} · {plan.discipline}
        </p>
        <p className="mt-1 text-sm text-ink-600">
          {plan.clases === 1
            ? "Clase suelta para esta clase."
            : `${plan.clasesRestantes === 1 ? "Te queda 1 clase" : `Te quedan ${plan.clasesRestantes} clases`} de ${plan.clases} en tu plan.`}
        </p>
        {plan.situacionPago === "EN_REVISION" ? (
          <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Pago en revisión</p>
        ) : plan.saldo > 0 ? (
          <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Por pagar: {formatCop(plan.saldo)}</p>
        ) : null}
        {canAttach && studio.paymentMethods.length ? (
          <div className="mt-4 space-y-2 border-t border-black/[0.06] pt-4">
            <p className="text-sm font-medium">Puedes pagar a:</p>
            {studio.paymentMethods.map((method, index) => (
              <p key={index} className="text-sm">
                <span className="font-semibold">{method.name}</span>
                {method.account ? <span className="ml-2 font-mono text-ink-600">{method.account}</span> : null}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {canAttach ? (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
          <p className="font-semibold">¿Ya pagaste? Adjunta el comprobante</p>
          <p className="mb-4 mt-1 text-sm text-ink-500">El estudio lo revisa y registra tu pago.</p>
          <ReceiptUploader token={booked.accessToken} />
        </div>
      ) : null}

      {plan.miPlan ? (
        <SaveLink
          path={myPlanHref(studio.slug, plan.miPlan)}
          title="Guarda tu enlace de Mi plan"
          description="Ahí ves cuántas clases te quedan, tus reservas y tu pago, y reservas sin volver a escribir tus datos."
          shareText={`Mi plan en ${studio.businessName}:`}
        />
      ) : null}

      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink-950 px-6 text-base font-semibold text-white hover:bg-ink-800 ${focusRing}`}
        >
          <FiMessageCircle className="size-5" />
          Avisar al estudio por WhatsApp
        </a>
      ) : null}

      <div className="rounded-3xl border border-dashed border-black/15 p-5 text-sm">
        <p className="font-semibold">Guarda el enlace de tu reserva</p>
        <p className="mt-1 text-ink-500">
          Con él puedes verla o cancelarla. Si cancelas con al menos {studio.horasCancelacion} h de anticipación, recuperas la clase.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={copyLink} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 font-medium ${focusRing}`}>
            {copied ? <FiCheck className="size-4" /> : <FiCopy className="size-4" />}
            {copied ? "Enlace copiado" : "Copiar enlace"}
          </button>
          <Link
            href={`/s/${studio.slug}/reserva/${booked.accessToken}`}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 font-medium underline underline-offset-4 ${focusRing}`}
          >
            Ver mi reserva
            <FiExternalLink className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
