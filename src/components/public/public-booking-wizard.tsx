"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiArrowLeft, FiCheck, FiClock, FiCopy, FiExternalLink, FiMessageCircle } from "react-icons/fi";
import { focusRing } from "@/components/public/public-shell";
import { ReceiptUploader } from "@/components/public/receipt-uploader";
import { ScrollHint } from "@/components/shared/scroll-hint";
import type { PublicSession } from "@/lib/public-studio";
import { formatCop, pricePerClass } from "@/lib/public-presentation";
import { WEEKDAYS, dateKeyToDate, formatTimeKey, isoWeekday } from "@/lib/studio-time";
import { cn } from "@/lib/web-utils";

type Step = "clase" | "datos" | "paquete" | "listo";

type Option = { id: string; nombre: string; clases: number; precio: number; discipline: { nombre: string; color: string } };

type Booked = {
  accessToken: string;
  paquete: { nombre: string; discipline: string; clasesRestantes: number; saldo: number };
};

type Waiting = { accessToken: string; posicion: number };

const STEP_LABELS: Record<Step, string> = { clase: "Clase", datos: "Tus datos", paquete: "Tu plan", listo: "Listo" };

function formatDay(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-CO", { ...options, timeZone: "UTC" }).format(dateKeyToDate(key));
}

const fieldClass =
  "w-full min-h-12 rounded-2xl border border-black/10 bg-white px-4 text-base text-ink-950 placeholder:text-ink-300 transition focus:border-ink-950 focus:outline-none focus:ring-4 focus:ring-black/5";

/**
 * Reserva publica (specs 009 y 012). Desde una clase de la pagina entra directo
 * a "Tus datos" (?h&f); desde un plan lo deja preseleccionado (?plan). Si la
 * clase esta llena, el mismo camino anota en la lista de espera (spec 015 R6).
 */
export function PublicBookingWizard({
  studio,
  sessions,
  today,
  initial
}: {
  studio: {
    slug: string;
    businessName: string;
    telefono: string | null;
    horasCancelacion: number;
    paymentMethods: Array<{ name: string; account: string }>;
  };
  sessions: PublicSession[];
  today: string;
  initial?: { scheduleId?: string; fecha?: string; planId?: string };
}) {
  const preselected = sessions.find(
    (session) => session.scheduleId === initial?.scheduleId && session.fecha === initial?.fecha
  );
  const days = useMemo(() => [...new Set(sessions.map((session) => session.fecha))], [sessions]);
  const [step, setStep] = useState<Step>(preselected ? "datos" : "clase");
  const [day, setDay] = useState(preselected?.fecha ?? days[0] ?? today);
  const [session, setSession] = useState<PublicSession | null>(preselected ?? null);
  const [celular, setCelular] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [packageId, setPackageId] = useState("");
  const [booked, setBooked] = useState<Booked | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const steps: Step[] = options.length ? ["clase", "datos", "paquete", "listo"] : ["clase", "datos", "listo"];
  const stepIndex = steps.indexOf(step);
  const validData = celular.replace(/\D/g, "").length >= 7 && nombre.trim().length >= 2;
  const waitlist = Boolean(session && session.cuposLibres <= 0);

  async function submit(withPackage?: string) {
    if (!session) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/studios/${studio.slug}/${waitlist ? "waitlist" : "bookings"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduleId: session.scheduleId,
          fecha: session.fecha,
          celular,
          nombre,
          apellido: apellido || null,
          ...(withPackage ? { packageId: withPackage } : {})
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? (waitlist ? "No pudimos anotarte. Intenta de nuevo." : "No pudimos apartar tu cupo. Intenta de nuevo."));
      }

      if (payload.data.estado === "NECESITA_PAQUETE") {
        const choices: Option[] = payload.data.opciones;
        if (!choices.length) throw new Error("Esta clase no tiene planes a la venta en línea. Escríbele al estudio.");
        setOptions(choices);
        // El plan elegido en la pagina, si sirve para esta clase; si no, la clase suelta.
        const fromPage = choices.find((item) => item.id === initial?.planId);
        setPackageId((fromPage ?? choices.find((item) => item.clases === 1) ?? choices[0]).id);
        setStep("paquete");
        return;
      }

      if (payload.data.estado === "EN_ESPERA") setWaiting(payload.data);
      else setBooked(payload.data);
      setStep("listo");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSending(false);
    }
  }

  function goBack() {
    setError(null);
    setStep(steps[Math.max(stepIndex - 1, 0)]);
  }

  if (!sessions.length) {
    return (
      <div className="rounded-3xl border border-black/[0.06] bg-white p-8 text-center">
        <p className="font-display text-3xl italic">Sin clases por ahora</p>
        <p className="mt-2 text-sm text-ink-500">Vuelve pronto o escríbele al estudio.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {step !== "listo" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {stepIndex > 0 ? (
              <button type="button" onClick={goBack} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 text-sm font-medium text-ink-500 hover:text-ink-950 ${focusRing}`}>
                <FiArrowLeft className="size-4" />
                Atrás
              </button>
            ) : (
              <Link href={`/s/${studio.slug}`} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 text-sm font-medium text-ink-500 hover:text-ink-950 ${focusRing}`}>
                <FiArrowLeft className="size-4" />
                Volver
              </Link>
            )}
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-ink-400">
              Paso {stepIndex + 1} de {steps.length - 1} · {STEP_LABELS[step]}
            </span>
          </div>
          <div className="flex gap-1.5" aria-hidden>
            {steps.slice(0, -1).map((item, index) => (
              <span key={item} className={cn("h-1 flex-1 rounded-full transition-colors", index <= stepIndex ? "bg-ink-950" : "bg-black/10")} />
            ))}
          </div>
        </div>
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
                      onClick={() => {
                        setSession(item);
                        setStep("datos");
                      }}
                      className={`flex w-full items-center gap-4 rounded-3xl border border-black/[0.06] bg-white p-4 text-left transition hover:border-black/20 ${focusRing}`}
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
        </section>
      ) : null}

      {step === "datos" && session ? (
        <section className="space-y-5">
          <SessionSummary session={session} onChange={() => setStep("clase")} />
          <h1 className="font-display text-5xl italic leading-none">Tus datos</h1>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-600">Celular</span>
              <input type="tel" inputMode="tel" autoComplete="tel" value={celular} onChange={(event) => setCelular(event.target.value)} placeholder="300 000 0000" className={fieldClass} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-600">Nombre</span>
                <input autoComplete="given-name" value={nombre} onChange={(event) => setNombre(event.target.value)} className={fieldClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-600">Apellido</span>
                <input autoComplete="family-name" value={apellido} onChange={(event) => setApellido(event.target.value)} className={fieldClass} />
              </label>
            </div>
            <p className="text-xs text-ink-500">Si ya tienes un plan con nosotros, usa el mismo celular y nombre.</p>
          </div>
          {waitlist ? <WaitlistNotice horasCancelacion={studio.horasCancelacion} /> : null}
          <ErrorBox message={error} />
          <PrimaryButton disabled={!validData} loading={sending} onClick={() => submit()}>
            {waitlist ? "Unirme a la lista de espera" : "Apartar mi cupo"}
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
                : "Aún no tienes un plan para esta clase. Pagas en el estudio o por transferencia."}
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
          <PrimaryButton disabled={!packageId} loading={sending} onClick={() => submit(packageId)}>
            {waitlist ? "Unirme a la lista de espera" : "Apartar mi cupo"}
          </PrimaryButton>
        </section>
      ) : null}

      {step === "listo" && session && booked ? <Confirmation studio={studio} session={session} booked={booked} nombre={nombre} /> : null}
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
        <span className="block text-sm capitalize text-ink-500">
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
          <span className="capitalize">{formatDay(session.fecha, { weekday: "long", day: "numeric", month: "long" })}</span> a las{" "}
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

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </p>
  );
}

function PrimaryButton({ children, disabled, loading, onClick }: { children: React.ReactNode; disabled?: boolean; loading?: boolean; onClick: () => void }) {
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

function Confirmation({
  studio,
  session,
  booked,
  nombre
}: {
  studio: { slug: string; businessName: string; telefono: string | null; horasCancelacion: number; paymentMethods: Array<{ name: string; account: string }> };
  session: PublicSession;
  booked: Booked;
  nombre: string;
}) {
  const [copied, setCopied] = useState(false);
  const manageUrl =
    typeof window === "undefined" ? `/s/${studio.slug}/reserva/${booked.accessToken}` : `${window.location.origin}/s/${studio.slug}/reserva/${booked.accessToken}`;
  const when = `${formatDay(session.fecha, { weekday: "long", day: "numeric", month: "long" })} a las ${formatTimeKey(session.horaInicio)}`;
  const message = [
    `Hola ${studio.businessName}, soy ${nombre.trim()}.`,
    `Aparté cupo en ${session.discipline.nombre} el ${when}.`,
    booked.paquete.saldo > 0 ? `Plan: ${booked.paquete.nombre} (${formatCop(booked.paquete.saldo)}). Te envío el comprobante.` : null,
    `Mi reserva: ${manageUrl}`
  ]
    .filter(Boolean)
    .join("\n");
  const digits = studio.telefono?.replace(/\D/g, "") ?? "";
  const whatsapp = digits ? `https://wa.me/${digits.length === 10 ? `57${digits}` : digits}?text=${encodeURIComponent(message)}` : null;

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
        <p className="mt-3 text-sm capitalize text-white/75">
          {session.discipline.nombre} · {when}
        </p>
      </div>

      <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
        <p className="text-sm text-ink-500">Tu plan</p>
        <p className="font-display text-2xl italic">
          {booked.paquete.nombre} · {booked.paquete.discipline}
        </p>
        {booked.paquete.saldo > 0 ? (
          <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Por pagar: {formatCop(booked.paquete.saldo)}</p>
        ) : (
          <p className="mt-1 text-sm text-ink-600">
            {booked.paquete.clasesRestantes === 1 ? "Te queda 1 clase" : `Te quedan ${booked.paquete.clasesRestantes} clases`} en tu plan.
          </p>
        )}
        {booked.paquete.saldo > 0 && studio.paymentMethods.length ? (
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

      {booked.paquete.saldo > 0 ? (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
          <p className="font-semibold">¿Ya pagaste? Adjunta el comprobante</p>
          <p className="mb-4 mt-1 text-sm text-ink-500">El estudio lo revisa y registra tu pago.</p>
          <ReceiptUploader token={booked.accessToken} />
        </div>
      ) : null}

      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink-950 px-6 text-base font-semibold text-white hover:bg-ink-800 ${focusRing}`}
        >
          <FiMessageCircle className="size-5" />
          {booked.paquete.saldo > 0 ? "Escribir al estudio por WhatsApp" : "Avisar por WhatsApp"}
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
