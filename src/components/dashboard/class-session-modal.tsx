"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { FiArrowLeft, FiCalendar, FiCheck, FiClock, FiList, FiSearch, FiUser, FiUserPlus, FiUsers, FiX } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/use-confirm";
import { MoneyInput } from "@/components/ui/money-input";
import { PAYMENT_METHODS } from "@/components/ui/payment-method-modal";
import { ColorDot, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import { AttendanceToggle } from "@/components/dashboard/attendance-ui";
import { InstructorSelect, type InstructorOption } from "@/components/dashboard/instructor-select";
import { ReminderList } from "@/components/dashboard/reminder-list";
import { memberName } from "@/components/dashboard/studio-sales-ui";
import { clientApiFetch } from "@/lib/client-api";
import { dateKeyToDate, formatTimeKey } from "@/lib/studio-time";
import { cn, currency } from "@/lib/web-utils";
import type { ReminderItem } from "@/lib/studio-reminders";
import type { BookingItem, ClassSessionItem, StudioMemberItem } from "@/lib/web-types";
import type { WaitlistView } from "@/lib/waitlist";

type Options = {
  usable: Array<{ id: string; nombre: string; discipline: { nombre: string; color: string }; clasesRestantes: number }>;
  sellable: Array<{ id: string; nombre: string; clases: number; precio: number; discipline: { nombre: string; color: string } }>;
};

function formatLongDate(key: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    dateKeyToDate(key)
  );
}

/**
 * Detalle de una clase (specs 005 y 007): reservados, asistencia, reservar cupo
 * (con venta de clase suelta si hace falta), cupo de la fecha y cancelar.
 */
export function ClassSessionModal({
  session,
  today,
  instructors,
  canEditSchedule,
  onEditSchedule,
  onClose
}: {
  session: ClassSessionItem;
  today: string;
  instructors: InstructorOption[];
  canEditSchedule: boolean;
  onEditSchedule: () => void;
  onClose: () => void;
}) {
  const { data: auth } = useSession();
  const token = auth?.user.apiToken ?? "";
  const [bookings, setBookings] = useState<BookingItem[] | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistView[]>([]);
  const [mode, setMode] = useState<"detalle" | "reservar">("detalle");
  // Spec 023 D5: quien la dicta cambia al elegir un reemplazo sin cerrar el detalle.
  const [teacher, setTeacher] = useState(session.instructor);

  const loadBookings = useCallback(async () => {
    if (!token) return;
    const data = await clientApiFetch<BookingItem[]>(
      `/api/bookings?scheduleId=${session.scheduleId}&fecha=${session.fecha}`,
      token
    ).catch(() => []);
    setBookings(data);
    // Spec 015 R4: la lista de espera cambia junto con las reservas (cancelar puede asignar cupo).
    const waiting = await clientApiFetch<WaitlistView[]>(
      `/api/waitlist?scheduleId=${session.scheduleId}&fecha=${session.fecha}`,
      token
    ).catch(() => []);
    setWaitlist(waiting);
  }, [token, session.scheduleId, session.fecha]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const active = (bookings ?? []).filter((booking) => booking.estado !== "CANCELADA");
  const cancelled = (bookings ?? []).filter((booking) => booking.estado === "CANCELADA");
  const isPast = session.fecha < today;
  const canBook = !session.cancelada && !isPast && active.length < session.cupo;

  return (
    <Modal
      open
      onClose={onClose}
      title={session.discipline.nombre}
      description={`${formatLongDate(session.fecha)} · ${formatTimeKey(session.horaInicio)} – ${formatTimeKey(session.horaFin)}`}
    >
      {mode === "reservar" ? (
        <BookingForm
          session={session}
          token={token}
          onBack={() => setMode("detalle")}
          onBooked={async () => {
            setMode("detalle");
            await loadBookings();
          }}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <InfoBlock icon={<FiUsers />} label="Cupos" value={`${bookings ? active.length : session.reservadas}/${session.cupo}`} />
            <InfoBlock icon={<FiClock />} label="Duración" value={`${session.duracionMin} min`} />
            {/* Opcional: se define en Horarios fijos al crear o editar el horario. */}
            <InfoBlock icon={<FiUser />} label="Instructor" value={teacher || "Sin asignar"} muted={!teacher} />
          </div>

          {!session.cancelada && instructors.length ? (
            <ReplacementPicker session={session} instructors={instructors} onChange={setTeacher} />
          ) : null}

          {session.cancelada ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <p className="font-semibold">Clase cancelada</p>
              {session.motivoCancelacion ? <p className="mt-0.5 text-xs">{session.motivoCancelacion}</p> : null}
            </div>
          ) : null}

          {session.cancelada ? <CancelledClassReminders session={session} token={token} /> : null}

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink-800">Reservados</h3>
              {canBook ? (
                <Button className="rounded-xl px-3 py-1.5 text-xs font-medium shadow-none" onClick={() => setMode("reservar")}>
                  <FiUserPlus className="size-3.5" />
                  Reservar cupo
                </Button>
              ) : !session.cancelada && !isPast ? (
                <span className="text-xs font-semibold text-amber-600">Sin cupos</span>
              ) : null}
            </div>
            {bookings === null ? (
              <p className="py-4 text-center text-xs text-ink-400">Cargando…</p>
            ) : active.length ? (
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {active.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} isFuture={!isPast} canMark={session.fecha <= today} onChanged={loadBookings} />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-ink-200 py-4 text-center text-xs text-ink-400">
                Nadie ha reservado todavía
              </p>
            )}
            {cancelled.length ? (
              <p className="mt-2 text-[11px] text-ink-400">
                Cancelaron: {cancelled.map((booking) => memberName(booking.member)).join(", ")}
              </p>
            ) : null}
          </section>

          {waitlist.length ? (
            <WaitlistSection
              entries={waitlist}
              canAssign={!session.cancelada && !isPast && active.length < session.cupo}
              onChanged={loadBookings}
            />
          ) : null}

          <SessionSettings
            session={session}
            booked={active.length}
            canEditSchedule={canEditSchedule}
            onEditSchedule={onEditSchedule}
            onDone={onClose}
          />
        </div>
      )}
    </Modal>
  );
}

function InfoBlock({ icon, label, value, muted = false }: { icon: React.ReactNode; label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-100 bg-ink-50/60 p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400 [&>svg]:size-3">
        {icon}
        {label}
      </p>
      <p className={cn("mt-1 truncate text-sm", muted ? "font-medium text-ink-400" : "font-bold text-ink-800")} title={value}>
        {value}
      </p>
    </div>
  );
}

function BookingRow({
  booking,
  isFuture,
  canMark,
  onChanged
}: {
  booking: BookingItem;
  /** Hoy o despues: se puede cancelar. */
  isFuture: boolean;
  /** Hoy o antes: se puede marcar asistencia. */
  canMark: boolean;
  onChanged: () => Promise<void>;
}) {
  const request = useStudioRequest();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refund, setRefund] = useState(false);
  const name = memberName(booking.member);

  async function update(body: Record<string, unknown>, key: string, title: string) {
    setBusy(key);
    const saved = await request(`/api/bookings/${booking.id}`, { method: "PUT", body: JSON.stringify(body) }, title);
    setBusy(null);
    if (saved) {
      setCancelOpen(false);
      await onChanged();
    }
    return saved;
  }

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-800">{name}</p>
          <p className="truncate text-[11px] text-ink-500">
            {booking.memberPackage.nombre} {booking.memberPackage.discipline.nombre} · quedan {booking.memberPackage.clasesRestantes}
            {booking.origen === "PUBLICO" ? " · reservó en línea" : ""}
          </p>
        </div>
        <AttendanceToggle bookingId={booking.id} estado={booking.estado} name={name} disabled={!canMark} onChanged={onChanged} />
      </div>
      {isFuture && booking.estado === "RESERVADA" ? (
        <button type="button" onClick={() => setCancelOpen(true)} className="text-[11px] font-medium text-rose-600 hover:underline">
          Cancelar reserva
        </button>
      ) : null}

      <ConfirmDialog
        open={cancelOpen}
        title="¿Cancelar la reserva?"
        description={`${name} · ${booking.memberPackage.nombre} ${booking.memberPackage.discipline.nombre}`}
        notice="Se libera el cupo. Dentro del plazo de cancelación la clase vuelve a su plan; fuera de plazo se pierde, salvo que marques la casilla."
        confirmText="Cancelar reserva"
        cancelText="Volver"
        loading={busy === "cancel"}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => update({ cancelar: true, devolverClase: refund }, "cancel", "Reserva cancelada")}
      >
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="size-4 accent-brand-600" checked={refund} onChange={(event) => setRefund(event.target.checked)} />
          Devolver la clase aunque esté fuera de plazo
        </label>
      </ConfirmDialog>
    </li>
  );
}

/** Spec 015 R4: lista de espera de la clase, en orden de llegada. */
function WaitlistSection({ entries, canAssign, onChanged }: { entries: WaitlistView[]; canAssign: boolean; onChanged: () => Promise<void> }) {
  const request = useStudioRequest();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const waiting = entries.filter((entry) => entry.estado === "EN_ESPERA");
  const assigned = entries.filter((entry) => entry.estado === "ASIGNADA");

  async function act(entry: WaitlistView, action: "assign" | "remove") {
    if (action === "remove") {
      const ok = await confirm({
        title: "¿Quitar de la lista de espera?",
        description: `${memberName(entry.member)} sale de la lista de esta clase.`,
        notice: "Pierde su puesto: si vuelve a anotarse, queda de última.",
        confirmText: "Quitar"
      });
      if (!ok) return;
    }
    setBusy(entry.id);
    const done =
      action === "assign"
        ? await request(`/api/waitlist/${entry.id}/assign`, { method: "POST" }, `Cupo para ${memberName(entry.member)}`)
        : await request(`/api/waitlist/${entry.id}`, { method: "DELETE" }, "Quitada de la lista de espera");
    setBusy(null);
    if (done) await onChanged();
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
        <FiList className="size-3.5 text-ink-400" />
        Lista de espera <span className="font-normal text-ink-400">({waiting.length})</span>
      </h3>
      {waiting.length ? (
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
          {waiting.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-600">
                  {entry.posicion}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-800">{memberName(entry.member)}</p>
                  <p className="truncate text-[11px] text-ink-500">
                    {entry.member.celular} · {entry.plan ? `comprará ${entry.plan}` : "con su plan"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {canAssign ? (
                  <Button
                    className="rounded-lg px-2.5 py-1 text-xs shadow-none"
                    loading={busy === entry.id}
                    disabled={busy !== null}
                    onClick={() => act(entry, "assign")}
                  >
                    Dar cupo
                  </Button>
                ) : null}
                <button
                  type="button"
                  disabled={busy !== null}
                  title="Quitar de la lista"
                  onClick={() => act(entry, "remove")}
                  className="flex size-7 items-center justify-center rounded-lg border border-ink-200 text-ink-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  <FiX className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-ink-200 py-3 text-center text-xs text-ink-400">Nadie en espera</p>
      )}
      {assigned.length ? (
        <p className="mt-2 text-[11px] text-ink-400">
          Recibieron cupo de la lista: {assigned.map((entry) => memberName(entry.member)).join(", ")}. Avísales desde Avisos.
        </p>
      ) : null}
      {dialog}
    </section>
  );
}

export function BookingForm({
  session,
  token,
  onBack,
  onBooked,
  walkIn = false
}: {
  session: ClassSessionItem;
  token: string;
  onBack: () => void;
  onBooked: () => Promise<void>;
  /** Spec 019 R7: llego sin reservar; la reserva queda con asistencia. */
  walkIn?: boolean;
}) {
  const request = useStudioRequest();
  const [members, setMembers] = useState<StudioMemberItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [member, setMember] = useState<StudioMemberItem | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [usableId, setUsableId] = useState("");
  const [sellId, setSellId] = useState("");
  const [pagarAhora, setPagarAhora] = useState(true);
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    clientApiFetch<StudioMemberItem[]>("/api/studio-members", token)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [token]);

  useEffect(() => {
    if (!member || !token) return;
    setOptions(null);
    clientApiFetch<Options>(
      `/api/bookings/options?memberId=${member.id}&scheduleId=${session.scheduleId}&fecha=${session.fecha}`,
      token
    )
      .then((data) => {
        setOptions(data);
        setUsableId(data.usable[0]?.id ?? "");
        // Por defecto la clase suelta: es lo que se cobra a quien llega sin paquete.
        const dropIn = data.sellable.find((item) => item.clases === 1) ?? data.sellable[0];
        setSellId(dropIn?.id ?? "");
        setMonto(dropIn ? String(Math.round(dropIn.precio)) : "");
      })
      .catch(() => setOptions({ usable: [], sellable: [] }));
  }, [member, token, session.scheduleId, session.fecha]);

  const visibleMembers = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("es");
    const digits = query.replace(/\D/g, "");
    return (members ?? [])
      .filter(
        (item) =>
          !text || memberName(item).toLocaleLowerCase("es").includes(text) || (digits.length >= 3 && item.celular.includes(digits))
      )
      .slice(0, 8);
  }, [members, query]);

  const toSell = options?.sellable.find((item) => item.id === sellId);
  const amount = Number(monto || 0);

  async function submit() {
    if (!member) return;
    setSaving(true);
    const body = options?.usable.length
      ? { memberPackageId: usableId }
      : {
          venta: {
            packageId: sellId,
            ...(pagarAhora && amount > 0 ? { pago: { monto: amount, metodoPago } } : {})
          }
        };
    const saved = await request(
      "/api/bookings",
      {
        method: "POST",
        body: JSON.stringify({
          scheduleId: session.scheduleId,
          fecha: session.fecha,
          memberId: member.id,
          ...body,
          ...(walkIn ? { llegoSinReservar: true } : {})
        })
      },
      walkIn
        ? `Llegada de ${memberName(member)} registrada`
        : options?.usable.length
          ? "Cupo reservado"
          : `${toSell?.clases === 1 ? "Clase suelta vendida" : "Paquete vendido"} y cupo reservado`
    );
    setSaving(false);
    if (saved) await onBooked();
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={member ? () => setMember(null) : onBack} className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-600">
        <FiArrowLeft className="size-3.5" />
        {member ? "Elegir otro cliente" : "Volver"}
      </button>

      {!member ? (
        <>
          <label className="relative block">
            <span className="sr-only">Buscar cliente</span>
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente por nombre o celular"
              className={`${inputClass} pl-9`}
            />
          </label>
          {members === null ? (
            <p className="py-4 text-center text-xs text-ink-400">Cargando clientes…</p>
          ) : visibleMembers.length ? (
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
              {visibleMembers.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => setMember(item)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-ink-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-800">{memberName(item)}</span>
                      <span className="block text-[11px] text-ink-500">{item.celular}</span>
                    </span>
                    {item.vigentes.length ? (
                      <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">Con paquete</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-xs text-ink-500">
              {members.length ? "Nadie coincide." : "Aún no tienes clientes."} Créalo en Ventas → Clientes.
            </p>
          )}
        </>
      ) : options === null ? (
        <p className="py-4 text-center text-xs text-ink-400">Revisando paquetes de {memberName(member)}…</p>
      ) : options.usable.length ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-700">
            Se descontará 1 clase a <span className="font-semibold">{memberName(member)}</span> de:
          </p>
          <div className="space-y-2">
            {options.usable.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={usableId === item.id}
                onClick={() => setUsableId(item.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left",
                  usableId === item.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                  <ColorDot color={item.discipline.color} className="size-2.5" />
                  {item.nombre} · {item.discipline.nombre}
                </span>
                <span className="text-xs text-ink-500">quedan {item.clasesRestantes}</span>
              </button>
            ))}
          </div>
          <Button className="w-full rounded-xl py-2.5 shadow-none" loading={saving} disabled={!usableId} onClick={submit}>
            <FiCalendar className="size-4" />
            {walkIn ? "Registrar llegada" : "Reservar cupo"}
          </Button>
        </div>
      ) : options.sellable.length ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {memberName(member)} no tiene un paquete vigente para {session.discipline.nombre}. Véndele uno y se reserva el cupo.
          </p>
          <div className="space-y-2">
            {options.sellable.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={sellId === item.id}
                onClick={() => {
                  setSellId(item.id);
                  setMonto(String(Math.round(item.precio)));
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left",
                  sellId === item.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300"
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 truncate text-sm font-semibold text-ink-800">
                    <ColorDot color={item.discipline.color} className="size-2.5" />
                    {item.nombre} · {item.discipline.nombre}
                  </span>
                  <span className="block text-[11px] text-ink-500">{item.clases === 1 ? "Clase suelta" : `${item.clases} clases`}</span>
                </span>
                <span className="shrink-0 text-sm font-bold text-ink-900">{currency(item.precio)}</span>
              </button>
            ))}
          </div>
          <div className="space-y-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
              <input type="checkbox" className="size-4 accent-brand-600" checked={pagarAhora} onChange={(event) => setPagarAhora(event.target.checked)} />
              Pagó ahora
            </label>
            {pagarAhora ? (
              <>
                <div>
                  <span className={labelClass}>Monto recibido</span>
                  <MoneyInput value={monto} onChange={setMonto} className="h-[42px] rounded-xl py-2.5 text-sm" aria-label="Monto recibido" />
                  {toSell && amount > toSell.precio ? <p className="mt-1 text-[11px] text-rose-600">Supera el precio</p> : null}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      aria-pressed={metodoPago === method.value}
                      onClick={() => setMetodoPago(method.value)}
                      className={cn(
                        "rounded-xl border px-2 py-1.5 text-xs font-medium",
                        metodoPago === method.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600"
                      )}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-ink-500">Quedará debiendo {toSell ? currency(toSell.precio) : ""}.</p>
            )}
          </div>
          <Button
            className="w-full rounded-xl py-2.5 shadow-none"
            loading={saving}
            disabled={!sellId || (pagarAhora && (amount <= 0 || (toSell ? amount > toSell.precio : false)))}
            onClick={submit}
          >
            {walkIn ? "Vender y registrar llegada" : "Vender y reservar"}
          </Button>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-xs text-ink-500">
          No hay paquetes a la venta para {session.discipline.nombre}. Créalos en Paquetes y precios.
        </p>
      )}
    </div>
  );
}

function SessionSettings({
  session,
  booked,
  canEditSchedule,
  onEditSchedule,
  onDone
}: {
  session: ClassSessionItem;
  booked: number;
  canEditSchedule: boolean;
  onEditSchedule: () => void;
  onDone: () => void;
}) {
  const request = useStudioRequest();
  const [cupo, setCupo] = useState(String(session.cupo));
  const [motivo, setMotivo] = useState(session.motivoCancelacion ?? "");
  const [saving, setSaving] = useState<"cupo" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function save(body: Record<string, unknown>, kind: "cupo" | "cancel", title: string) {
    setSaving(kind);
    const saved = await request(
      "/api/class-sessions",
      { method: "PUT", body: JSON.stringify({ scheduleId: session.scheduleId, fecha: session.fecha, ...body }) },
      title
    );
    setSaving(null);
    if (saved) onDone();
  }

  const cupoNumber = Number(cupo);

  return (
    <details className="rounded-xl border border-ink-200 p-3" open={session.cancelada}>
      <summary className="cursor-pointer text-sm font-semibold text-ink-700">Ajustes de esta clase</summary>
      <div className="mt-3 space-y-3">
        {!session.cancelada ? (
          <div>
            <label className={labelClass} htmlFor="session-cupo">
              Cupo solo para esta fecha
            </label>
            <div className="flex gap-2">
              <input
                id="session-cupo"
                type="number"
                inputMode="numeric"
                min={Math.max(booked, 1)}
                max={500}
                value={cupo}
                onChange={(event) => setCupo(event.target.value)}
                className={inputClass}
              />
              <Button
                type="button"
                className="shrink-0 rounded-xl px-4 py-2 font-medium shadow-none"
                disabled={cupoNumber === session.cupo || !Number.isInteger(cupoNumber) || cupoNumber < Math.max(booked, 1)}
                loading={saving === "cupo"}
                onClick={() => save({ cupo: cupoNumber }, "cupo", "Cupo actualizado")}
              >
                Guardar
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-ink-400">
              Los demás días con este horario no cambian.{booked ? ` Mínimo ${booked} (ya reservados).` : ""}
            </p>
          </div>
        ) : null}

        {session.cancelada ? (
          <Button
            type="button"
            className="w-full rounded-xl py-2.5 shadow-none"
            loading={saving === "cancel"}
            onClick={() => save({ cancelada: false }, "cancel", "Clase reactivada")}
          >
            Reactivar clase
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            {canEditSchedule ? (
              <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onEditSchedule}>
                <FiCalendar className="size-4" />
                Editar horario fijo
              </Button>
            ) : null}
            <Button type="button" variant="ghost" className="flex-1 rounded-xl py-2.5 text-rose-600 hover:bg-rose-50" onClick={() => setConfirmCancel(true)}>
              Cancelar esta clase
            </Button>
          </div>
        )}
      </div>

      {/* Spec 019 R2: cancelar la clase se confirma en un modal, con el motivo. */}
      <ConfirmDialog
        open={confirmCancel}
        title="¿Cancelar esta clase?"
        description={`${session.discipline.nombre} · ${formatLongDate(session.fecha)} · ${formatTimeKey(session.horaInicio)}`}
        notice={
          booked
            ? `Se cancelarán ${booked} reserva${booked === 1 ? "" : "s"} y a cada una se le devolverá la clase. Luego podrás avisarles por WhatsApp desde esta misma clase.`
            : "Nadie ha reservado todavía. La clase deja de aparecer en tu página."
        }
        confirmText="Cancelar clase"
        cancelText="Volver"
        loading={saving === "cancel"}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => save({ cancelada: true, motivoCancelacion: motivo }, "cancel", "Clase cancelada")}
      >
        <label className={labelClass} htmlFor="session-motivo">
          Motivo <span className="text-ink-400">(opcional, lo verán tus clientes)</span>
        </label>
        <input id="session-motivo" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ej: festivo" className={inputClass} />
      </ConfirmDialog>
    </details>
  );
}

/** Spec 011 R5: avisar por WhatsApp a quienes tenian cupo en la clase cancelada. */
function CancelledClassReminders({ session, token }: { session: ClassSessionItem; token: string }) {
  const [items, setItems] = useState<ReminderItem[] | null>(null);

  useEffect(() => {
    if (!token) return;
    clientApiFetch<ReminderItem[]>(`/api/studio-reminders?scheduleId=${session.scheduleId}&fecha=${session.fecha}`, token)
      .then(setItems)
      .catch(() => setItems([]));
  }, [token, session.scheduleId, session.fecha]);

  if (!items?.length) return null;
  return (
    <section className="rounded-xl border border-ink-200 p-3">
      <h3 className="text-sm font-semibold text-ink-800">Avisar a quienes tenían cupo</h3>
      <p className="text-xs text-ink-500">A cada una ya se le devolvió la clase.</p>
      <ReminderList items={items} empty="" />
    </section>
  );
}

/**
 * Spec 023 D5/R4: reemplazo de una sola fecha. La clase se le paga a quien la
 * dicta; elegir "el titular" quita el reemplazo.
 */
function ReplacementPicker({
  session,
  instructors,
  onChange
}: {
  session: ClassSessionItem;
  instructors: InstructorOption[];
  onChange: (teacher: string | null) => void;
}) {
  const request = useStudioRequest();
  const [value, setValue] = useState(session.reemplazo ? (session.instructorId ?? "") : "");
  const [saving, setSaving] = useState(false);
  const options = instructors.filter((item) => item.id !== session.titularId);
  // Un reemplazo que despues se desactivo sigue visible para no perderlo.
  const extra =
    session.reemplazo && session.instructorId && !options.some((item) => item.id === session.instructorId)
      ? { value: session.instructorId, label: `${session.instructor} (inactivo)` }
      : null;
  const nameOf = (id: string) => (id ? (options.find((item) => item.id === id)?.nombre ?? (id === session.instructorId ? session.instructor : null)) : session.titular);
  const paidTo = nameOf(value);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    const saved = await request(
      "/api/class-sessions",
      { method: "PUT", body: JSON.stringify({ scheduleId: session.scheduleId, fecha: session.fecha, instructorId: next || null }) },
      next ? "Reemplazo guardado" : "La dicta el titular"
    );
    setSaving(false);
    if (saved) onChange(nameOf(next));
    else setValue(previous);
  }

  return (
    <div className="rounded-xl border border-ink-200 p-3">
      <label className={labelClass} htmlFor="session-replacement">
        Reemplazo para esta fecha
      </label>
      <InstructorSelect
        id="session-replacement"
        value={value}
        onChange={change}
        instructors={options}
        disciplineId={session.discipline.id}
        emptyLabel={session.titular ? `Sin reemplazo · la dicta ${session.titular}` : "Sin reemplazo"}
        extraOption={extra}
        disabled={saving}
      />
      <p className="mt-1.5 text-[11px] text-ink-500">
        {paidTo ? (
          <>
            Esta clase se le paga a <span className="font-semibold text-ink-700">{paidTo}</span>.
          </>
        ) : (
          "Sin instructor: esta clase no se le paga a nadie."
        )}
      </p>
    </div>
  );
}
