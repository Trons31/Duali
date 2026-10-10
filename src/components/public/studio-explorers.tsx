"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiCheck, FiCopy, FiUser } from "react-icons/fi";
import { focusRing } from "@/components/public/public-shell";
import { ScrollHint } from "@/components/shared/scroll-hint";
import type { CatalogItem } from "@/components/public/studio-sections";
import type { PublicSession } from "@/lib/public-studio";
import { bestValuePlanId, formatCop, pricePerClass, purchaseHref, reserveHref } from "@/lib/public-presentation";
import { WEEKDAYS, dateKeyToDate, formatTimeKey, isoWeekday } from "@/lib/studio-time";
import { cn } from "@/lib/web-utils";

// Partes interactivas de la pagina publica (spec 012 R3, R5, R6). Todo el
// contenido viene pintado del servidor; el JavaScript solo cambia lo visible.

const dayNumber = (key: string) => new Intl.DateTimeFormat("es-CO", { day: "numeric", timeZone: "UTC" }).format(dateKeyToDate(key));
const monthName = (key: string) => new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" }).format(dateKeyToDate(key));

function spots(session: PublicSession) {
  if (session.cancelada) return { text: "Cancelada", tone: "text-rose-600" };
  if (session.cuposLibres <= 0) return { text: "Lleno · lista de espera", tone: "text-ink-500" };
  if (session.cuposLibres === 1) return { text: "Queda 1 cupo", tone: "text-amber-700" };
  return { text: `Quedan ${session.cuposLibres} cupos`, tone: session.cuposLibres <= 3 ? "text-amber-700" : "text-ink-600" };
}

/** Spec 012 R3: elige el dia y reserva desde la clase. */
export function ScheduleExplorer({ slug, sessions, today }: { slug: string; sessions: PublicSession[]; today: string }) {
  const days = useMemo(() => [...new Set(sessions.map((session) => session.fecha))], [sessions]);
  const [day, setDay] = useState(days[0] ?? today);

  if (!days.length) {
    return <p className="rounded-3xl border border-black/[0.06] bg-white p-8 text-center text-sm text-ink-500">Pronto publicaremos el horario.</p>;
  }

  return (
    <div>
      <ScrollHint className="-mx-4 sm:mx-0" scrollerClassName="flex gap-2 px-4 pb-1 sm:px-0" role="tablist" aria-label="Días">
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
            <span className="font-display text-3xl leading-none">{dayNumber(key)}</span>
          </button>
        ))}
      </ScrollHint>

      {/* Todos los dias van en el HTML (se ven sin JavaScript y los buscadores los leen); se muestra el elegido. */}
      {days.map((key) => (
        <div key={key} role="tabpanel" className={cn("mt-4 space-y-3", day === key ? "" : "hidden")}>
          <p className="text-sm text-ink-500">
            {WEEKDAYS[isoWeekday(key) - 1].label} {dayNumber(key)} de {monthName(key)}
          </p>
          {sessions
            .filter((session) => session.fecha === key)
            .map((session) => {
              const label = spots(session);
              const available = !session.cancelada && session.cuposLibres > 0;
              // Spec 015 R6: llena, se puede anotar en la lista de espera.
              const waitlist = !session.cancelada && !available;
              return (
                <article
                  key={`${session.scheduleId}-${session.fecha}`}
                  className={cn("flex items-center gap-4 rounded-3xl border border-black/[0.06] bg-white p-4 sm:p-5", session.cancelada && "opacity-60")}
                >
                  <div className="w-16 shrink-0 text-center sm:w-20">
                    <p className="font-display text-3xl leading-none">{formatTimeKey(session.horaInicio).split(" ")[0]}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase text-ink-400">{formatTimeKey(session.horaInicio).split(" ").slice(1).join(" ")}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("flex items-center gap-2 truncate font-semibold", session.cancelada && "line-through")}>
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: session.discipline.color }} />
                      {session.discipline.nombre}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
                      <span>hasta {formatTimeKey(session.horaFin)}</span>
                      {session.instructor ? (
                        <span className="flex items-center gap-1">
                          <FiUser className="size-3" />
                          {session.instructor}
                        </span>
                      ) : null}
                    </p>
                    <p className={cn("mt-1 text-xs font-semibold", label.tone)}>
                      {label.text}
                    </p>
                  </div>
                  {available ? (
                    <Link
                      href={reserveHref(slug, session)}
                      className={`inline-flex min-h-11 shrink-0 items-center rounded-full bg-ink-950 px-4 text-sm font-semibold text-white transition hover:bg-ink-800 active:scale-[0.97] ${focusRing}`}
                    >
                      Reservar
                    </Link>
                  ) : waitlist ? (
                    <Link
                      href={reserveHref(slug, session)}
                      className={`inline-flex min-h-11 shrink-0 items-center rounded-full border border-black/15 bg-white px-4 text-sm font-semibold text-ink-800 transition hover:border-black/30 active:scale-[0.97] ${focusRing}`}
                    >
                      Anotarme
                    </Link>
                  ) : null}
                </article>
              );
            })}
        </div>
      ))}
    </div>
  );
}

/** Spec 012 R5: planes por disciplina con precio por clase y "Mejor valor". */
export function PlansExplorer({ slug, catalog }: { slug: string; catalog: CatalogItem[] }) {
  const withPlans = catalog.filter((discipline) => discipline.packages.length);
  const [active, setActive] = useState(withPlans[0]?.id ?? "");
  if (!withPlans.length) return null;

  return (
    <div>
      <ScrollHint className="-mx-4 sm:mx-0" scrollerClassName="flex gap-2 px-4 pb-1 sm:px-0" role="tablist" aria-label="Disciplinas">
        {withPlans.map((discipline) => (
          <button
            key={discipline.id}
            type="button"
            role="tab"
            aria-selected={active === discipline.id}
            onClick={() => setActive(discipline.id)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
              active === discipline.id ? "border-ink-950 bg-ink-950 text-white" : "border-black/[0.08] bg-white text-ink-700 hover:border-black/20",
              focusRing
            )}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: discipline.color }} />
            {discipline.nombre}
          </button>
        ))}
      </ScrollHint>

      {withPlans.map((discipline) => {
        const best = bestValuePlanId(discipline.packages);
        return (
          <div key={discipline.id} role="tabpanel" className={cn("mt-5", active === discipline.id ? "" : "hidden")}>
            {discipline.tipo === "COMBO" && discipline.incluye.length ? (
              <p className="mb-4 text-sm text-ink-500">Tus clases sirven para {discipline.incluye.join(", ")}.</p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {discipline.packages.map((plan) => {
                const isBest = plan.id === best;
                return (
                  <article
                    key={plan.id}
                    className={cn(
                      "relative flex flex-col rounded-3xl border bg-white p-6",
                      isBest ? "border-ink-950 shadow-[0_20px_40px_-24px_rgba(15,23,36,0.45)]" : "border-black/[0.06]"
                    )}
                  >
                    {isBest ? (
                      <span className="absolute -top-3 left-6 rounded-full bg-ink-950 px-3 py-1 text-[11px] font-semibold text-white">Mejor valor</span>
                    ) : null}
                    <h3 className="font-display text-3xl italic leading-none">{plan.nombre}</h3>
                    <p className="mt-1 text-sm text-ink-500">{plan.clases === 1 ? "1 clase" : `${plan.clases} clases · ${plan.vigenciaDias} días`}</p>
                    <p className="mt-5 text-4xl font-semibold tracking-tight">{formatCop(plan.precio)}</p>
                    <p className="mt-1 text-xs text-ink-500">
                      {plan.clases > 1 ? `${formatCop(pricePerClass(plan))} por clase` : "Pago por clase"}
                    </p>
                    <Link
                      href={purchaseHref(slug, plan.id)}
                      className={cn(
                        "mt-6 inline-flex min-h-11 items-center justify-center rounded-full text-sm font-semibold transition",
                        isBest ? "bg-ink-950 text-white hover:bg-ink-800" : "border border-black/10 hover:border-black/30",
                        focusRing
                      )}
                    >
                      Elegir este plan
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Spec 012 R6: cuentas para pagar, con boton Copiar. */
export function PaymentAccounts({ methods }: { methods: Array<{ name: string; account: string }> }) {
  const [copied, setCopied] = useState<number | null>(null);

  async function copy(index: number, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(index);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Sin permiso de portapapeles: el numero sigue visible para copiarlo a mano.
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {methods.map((method, index) => (
        <div key={`${method.name}-${index}`} className="flex items-center justify-between gap-3 rounded-3xl border border-black/[0.06] bg-white p-5">
          <div className="min-w-0">
            <p className="font-semibold">{method.name || "Cuenta"}</p>
            {method.account ? <p className="mt-0.5 break-all font-mono text-sm text-ink-600">{method.account}</p> : null}
          </div>
          {method.account ? (
            <button
              type="button"
              onClick={() => copy(index, method.account)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-4 text-sm font-medium hover:border-black/30 ${focusRing}`}
            >
              {copied === index ? <FiCheck className="size-4" /> : <FiCopy className="size-4" />}
              {copied === index ? "Copiado" : "Copiar"}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
