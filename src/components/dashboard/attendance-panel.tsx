"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { FiAlertCircle, FiCheckCircle, FiChevronLeft, FiChevronRight, FiUser, FiUserPlus } from "react-icons/fi";
import { sileo } from "sileo";
import { AttendanceToggle } from "@/components/dashboard/attendance-ui";
import { BookingForm } from "@/components/dashboard/class-session-modal";
import { ColorDot } from "@/components/dashboard/studio-ui";
import { memberName } from "@/components/dashboard/studio-sales-ui";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { AttendanceSession, PendingAttendance } from "@/lib/attendance";
import { clientApiFetch } from "@/lib/client-api";
import { addDaysToKey, dateKeyToDate, formatTimeKey } from "@/lib/studio-time";
import { cn } from "@/lib/web-utils";

function longDate(key: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dateKeyToDate(key));
}

function shortDate(key: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(dateKeyToDate(key));
}

/**
 * Tomar asistencia (spec 019 R7, R10): las clases de un dia con su lista, un
 * toque por persona, "Todos asistieron" y "Llego sin reservar". Arriba, las
 * clases de dias anteriores que quedaron sin marcar.
 */
export function AttendancePanel({ today, initialDate }: { today: string; initialDate?: string }) {
  const { data: auth } = useSession();
  const token = auth?.user.apiToken ?? "";
  const [fecha, setFecha] = useState(initialDate ?? today);
  const [sessions, setSessions] = useState<AttendanceSession[] | null>(null);
  const [pending, setPending] = useState<PendingAttendance[]>([]);
  const [walkIn, setWalkIn] = useState<AttendanceSession | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const [day, late] = await Promise.all([
      clientApiFetch<AttendanceSession[]>(`/api/attendance?fecha=${fecha}`, token).catch(() => []),
      clientApiFetch<PendingAttendance[]>("/api/attendance?pendientes=1", token).catch(() => [])
    ]);
    setSessions(day);
    setPending(late);
  }, [token, fecha]);

  useEffect(() => {
    setSessions(null);
    void load();
  }, [load]);

  const isFuture = fecha > today;
  const otherPending = pending.filter((item) => item.fecha !== fecha);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-ink-200 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setFecha(addDaysToKey(fecha, -1))}
          className="flex size-10 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-50"
          aria-label="Día anterior"
        >
          <FiChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-bold capitalize text-ink-900">{longDate(fecha)}</p>
          {fecha === today ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Hoy</p>
          ) : (
            <button type="button" onClick={() => setFecha(today)} className="text-[11px] font-semibold text-brand-600 hover:underline">
              Ir a hoy
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFecha(addDaysToKey(fecha, 1))}
          className="flex size-10 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-50"
          aria-label="Día siguiente"
        >
          <FiChevronRight className="size-5" />
        </button>
      </div>

      {otherPending.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <FiAlertCircle className="size-4" />
            {otherPending.length === 1 ? "1 clase anterior sin asistencia" : `${otherPending.length} clases anteriores sin asistencia`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {otherPending.map((item) => (
              <button
                key={`${item.scheduleId}|${item.fecha}`}
                type="button"
                onClick={() => setFecha(item.fecha)}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:border-amber-300"
              >
                <ColorDot color={item.discipline.color} className="size-2" />
                <span className="capitalize">{shortDate(item.fecha)}</span> · {item.discipline.nombre} {formatTimeKey(item.horaInicio)}
                <span className="font-bold text-amber-700">{item.pendientes}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {sessions === null ? (
        <p className="py-10 text-center text-sm text-ink-400">Cargando…</p>
      ) : !sessions.length ? (
        <p className="rounded-2xl border border-dashed border-ink-200 bg-white py-10 text-center text-sm text-ink-500">No hay clases este día.</p>
      ) : (
        sessions.map((session) => {
          const unmarked = session.bookings.filter((booking) => booking.estado === "RESERVADA").length;
          return (
            <section key={session.key} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
              <header className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-ink-900">
                    <ColorDot color={session.discipline.color} />
                    {formatTimeKey(session.horaInicio)} · {session.discipline.nombre}
                  </p>
                  {session.instructor ? <p className="mt-0.5 text-xs text-ink-500">{session.instructor}</p> : null}
                </div>
                <span className="shrink-0 rounded-full bg-ink-50 px-2.5 py-1 text-xs font-semibold text-ink-600">
                  {session.reservadas}/{session.cupo} cupos
                </span>
              </header>

              {session.bookings.length ? (
                <ul className="divide-y divide-ink-100">
                  {session.bookings.map((booking) => {
                    const name = memberName(booking.member);
                    return (
                      <li key={booking.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-800">{name}</p>
                          <p className="truncate text-xs text-ink-500">
                            {booking.memberPackage.clases === 1
                              ? "Clase suelta"
                              : `${booking.memberPackage.nombre} · quedan ${booking.memberPackage.clasesRestantes}`}
                            {booking.sinReserva ? " · llegó sin reservar" : booking.origen === "PUBLICO" ? " · reservó en línea" : ""}
                            {booking.estado === "NO_ASISTIO" && booking.claseDevuelta ? " · clase devuelta" : ""}
                          </p>
                        </div>
                        <AttendanceToggle
                          bookingId={booking.id}
                          estado={booking.estado}
                          name={name}
                          size="lg"
                          disabled={isFuture}
                          onChanged={load}
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="flex items-center gap-2 px-4 py-4 text-sm text-ink-400">
                  <FiUser className="size-4" />
                  Nadie reservó esta clase.
                </p>
              )}

              {isFuture ? (
                <p className="border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 text-xs text-ink-500">La asistencia se toma el día de la clase.</p>
              ) : (
                <footer className="flex flex-col gap-2 border-t border-ink-100 bg-ink-50/60 p-3 sm:flex-row">
                  {unmarked > 0 ? (
                    <MarkAllButton token={token} session={session} count={unmarked} onDone={load} />
                  ) : null}
                  <Button variant="secondary" className="flex-1 rounded-xl py-2 text-sm" onClick={() => setWalkIn(session)}>
                    <FiUserPlus className="size-4" />
                    Llegó sin reservar
                  </Button>
                </footer>
              )}
            </section>
          );
        })
      )}

      {walkIn ? (
        <WalkInModal
          token={token}
          session={walkIn}
          onClose={() => setWalkIn(null)}
          onDone={async () => {
            setWalkIn(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function MarkAllButton({ token, session, count, onDone }: { token: string; session: AttendanceSession; count: number; onDone: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);

  async function markAll() {
    setSaving(true);
    try {
      await clientApiFetch("/api/class-sessions/attendance", token, {
        method: "POST",
        body: JSON.stringify({ scheduleId: session.scheduleId, fecha: session.fecha })
      });
      sileo.success({ title: count === 1 ? "1 asistencia marcada" : `${count} asistencias marcadas` });
      await onDone();
    } catch (error) {
      sileo.error({ title: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button className="flex-1 rounded-xl py-2 text-sm shadow-none" loading={saving} onClick={markAll}>
      <FiCheckCircle className="size-4" />
      Todos asistieron ({count})
    </Button>
  );
}

/** "Llego sin reservar" (R7). Si la clase esta llena, primero ofrece subir el cupo de esa fecha. */
function WalkInModal({
  token,
  session,
  onClose,
  onDone
}: {
  token: string;
  session: AttendanceSession;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [cupo, setCupo] = useState(session.cupo);
  const [raising, setRaising] = useState(false);
  const full = session.reservadas >= cupo;

  async function raiseCupo() {
    setRaising(true);
    try {
      await clientApiFetch("/api/class-sessions", token, {
        method: "PUT",
        body: JSON.stringify({ scheduleId: session.scheduleId, fecha: session.fecha, cupo: cupo + 1 })
      });
      setCupo(cupo + 1);
      sileo.success({ title: `Cupo de esta clase: ${cupo + 1}` });
    } catch (error) {
      sileo.error({ title: (error as Error).message });
    } finally {
      setRaising(false);
    }
  }

  return (
    <Modal size="md" open onClose={onClose} title="Llegó sin reservar" description={`${session.discipline.nombre} · ${formatTimeKey(session.horaInicio)} · queda con asistencia`}>
      {full ? (
        <div className="space-y-3">
          <p className={cn("rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900")}>
            La clase está llena ({session.reservadas}/{cupo}). Para registrar la llegada, sube el cupo de esta fecha.
          </p>
          <Button className="w-full rounded-xl py-2.5 shadow-none" loading={raising} onClick={raiseCupo}>
            Subir el cupo a {cupo + 1}
          </Button>
        </div>
      ) : (
        <BookingForm session={{ ...session, cupo }} token={token} walkIn onBack={onClose} onBooked={onDone} />
      )}
    </Modal>
  );
}
