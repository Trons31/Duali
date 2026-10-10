"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiArrowLeft, FiCalendar, FiEdit2, FiMail, FiMessageCircle, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/components/ui/use-confirm";
import { Modal } from "@/components/ui/modal";
import { PAYMENT_METHODS } from "@/components/ui/payment-method-modal";
import { ColorDot, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import {
  ClassesBar,
  MemberFormModal,
  PackageStatusBadge,
  PaymentStatusBadge,
  RegisterPaymentModal,
  SellPackageModal,
  formatDateKeyShort,
  memberName,
  whatsappLink
} from "@/components/dashboard/studio-sales-ui";
import { cn, currency, formatDate } from "@/lib/web-utils";
import { ReceiptReviewList } from "@/components/dashboard/receipt-review-list";
import type { ClassHistoryItem } from "@/lib/attendance";
import type { ReceiptView } from "@/lib/receipts";
import { formatTimeKey } from "@/lib/studio-time";
import type { BookingItem, DisciplineItem, MemberPackageItem, PackageItem, StudioMemberItem } from "@/lib/web-types";

const methodLabel = (value: string) => PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;

/** Ficha de un cliente del estudio (spec 006 R6 y R7). */
export function StudioMemberDetail({
  member,
  today,
  disciplines,
  packages,
  bookings,
  receipts = [],
  classHistory = []
}: {
  member: StudioMemberItem;
  today: string;
  disciplines: DisciplineItem[];
  packages: PackageItem[];
  bookings: BookingItem[];
  receipts?: ReceiptView[];
  classHistory?: ClassHistoryItem[];
}) {
  const router = useRouter();
  const request = useStudioRequest();
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paying, setPaying] = useState<MemberPackageItem | null>(null);
  const [extending, setExtending] = useState<MemberPackageItem | null>(null);
  const [voiding, setVoiding] = useState<MemberPackageItem | null>(null);

  // Primero lo que importa hoy: vigentes o con saldo; despues la historia.
  const current = member.packages.filter((item) => item.estado === "ACTIVO" || item.saldo > 0);
  const history = member.packages.filter((item) => !current.includes(item));

  async function handleDelete() {
    setDeleting(true);
    const deleted = await request(`/api/studio-members/${member.id}`, { method: "DELETE" }, "Cliente eliminado");
    setDeleting(false);
    if (deleted) router.push("/dashboard/clientes");
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link href="/dashboard/clientes" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600">
        <FiArrowLeft className="size-4" />
        Clientes
      </Link>

      <section className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-700">
              {member.nombre.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-ink-900">{memberName(member)}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
                <a
                  href={whatsappLink(member.celular)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                >
                  <FiMessageCircle className="size-3.5" />
                  {member.celular}
                </a>
                {member.email ? (
                  <span className="inline-flex items-center gap-1">
                    <FiMail className="size-3.5" />
                    {member.email}
                  </span>
                ) : null}
                {member.fechaNacimiento ? (
                  <span className="inline-flex items-center gap-1">
                    <FiCalendar className="size-3.5" />
                    {formatDateKeyShort(member.fechaNacimiento)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1 rounded-xl px-3 py-2 font-medium sm:flex-none" onClick={() => setEditing(true)}>
              <FiEdit2 className="size-4" />
              Editar
            </Button>
            <Button
              variant="ghost"
              className="rounded-xl px-3 py-2 text-rose-600 hover:bg-rose-50"
              onClick={() => setConfirmDelete(true)}
              aria-label="Eliminar cliente"
            >
              <FiTrash2 className="size-4" />
            </Button>
          </div>
        </div>
        {member.notas ? <p className="mt-4 rounded-xl bg-ink-50/70 p-3 text-sm text-ink-600">{member.notas}</p> : null}
        {member.saldo > 0 ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            Saldo pendiente: {currency(member.saldo)}
          </p>
        ) : null}
      </section>

      {receipts.length ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-ink-800">Comprobantes por revisar</h2>
          <ReceiptReviewList receipts={receipts} showMember={false} />
        </section>
      ) : null}

      {bookings.length ? <UpcomingBookings bookings={bookings} /> : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink-800">Paquetes</h2>
          <Button className="rounded-xl px-4 py-2 font-medium shadow-none" onClick={() => setSelling(true)}>
            <FiPlus className="size-4" />
            Vender paquete
          </Button>
        </div>

        {current.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {current.map((item) => (
              <SaleCard
                key={item.id}
                item={item}
                today={today}
                classes={classHistory.filter((entry) => entry.memberPackageId === item.id)}
                onPay={() => setPaying(item)}
                onExtend={() => setExtending(item)}
                onVoid={() => setVoiding(item)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-ink-200 bg-white p-6 text-center text-sm text-ink-500">
            Sin paquete vigente. Véndele uno o una clase suelta.
          </p>
        )}

        {history.length ? (
          <details className="group rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-ink-600">Historial ({history.length})</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {history.map((item) => (
                <SaleCard
                  key={item.id}
                  item={item}
                  today={today}
                  classes={classHistory.filter((entry) => entry.memberPackageId === item.id)}
                  onExtend={() => setExtending(item)}
                />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {editing ? <MemberFormModal member={member} onClose={() => setEditing(false)} /> : null}
      {selling ? (
        <SellPackageModal
          memberId={member.id}
          memberLabel={memberName(member)}
          today={today}
          disciplines={disciplines}
          packages={packages}
          onClose={() => setSelling(false)}
        />
      ) : null}
      {paying ? <RegisterPaymentModal sale={paying} today={today} onClose={() => setPaying(null)} /> : null}
      {extending ? <ExtendModal sale={extending} onClose={() => setExtending(null)} /> : null}
      {voiding ? <VoidModal sale={voiding} onClose={() => setVoiding(null)} /> : null}

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar cliente"
        description={`Eliminarás a ${memberName(member)}.`}
        notice="Solo se puede si no tiene paquetes vigentes ni saldo. Si vuelves a crear su celular, se recupera su historia."
        loading={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function SaleCard({
  item,
  today,
  classes,
  onPay,
  onExtend,
  onVoid
}: {
  item: MemberPackageItem;
  today: string;
  classes: ClassHistoryItem[];
  onPay?: () => void;
  onExtend?: () => void;
  onVoid?: () => void;
}) {
  const request = useStudioRequest();
  const [voidingPayment, setVoidingPayment] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const isVoided = item.estado === "ANULADO";

  // Spec 019 R2: anular un pago pide confirmacion y dice que pasa con el saldo.
  async function voidPayment(payment: (typeof item.payments)[number]) {
    const ok = await confirm({
      title: "¿Anular este pago?",
      description: `${currency(payment.monto)} del ${formatDate(payment.fecha)} · ${methodLabel(payment.metodoPago)}`,
      notice: `La venta quedará debiendo ${currency(item.saldo + payment.monto)}. El pago queda tachado en el historial; úsalo solo si se registró por error.`,
      confirmText: "Anular pago"
    });
    if (!ok) return;
    setVoidingPayment(payment.id);
    await request(`/api/member-packages/${item.id}/payments/${payment.id}`, { method: "DELETE" }, "Pago anulado");
    setVoidingPayment(null);
  }

  return (
    <article className={cn("space-y-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm", isVoided && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-semibold text-ink-800">
            <ColorDot color={item.discipline.color} />
            {item.nombre} · {item.discipline.nombre}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {formatDateKeyShort(item.inicio)} – {formatDateKeyShort(item.vence)}
          </p>
        </div>
        <PackageStatusBadge item={item} />
      </div>

      {!isVoided ? <ClassesBar item={item} legend /> : null}
      {classes.length && !item.claseSuelta ? <PackageClasses classes={classes} today={today} /> : null}
      {isVoided && item.motivoAnulacion ? <p className="text-xs text-ink-500">Motivo: {item.motivoAnulacion}</p> : null}

      <div className="flex items-center justify-between gap-2 rounded-xl bg-ink-50/70 px-3 py-2 text-xs">
        <span className="text-ink-500">
          {currency(item.pagado)} de {currency(item.precio)}
        </span>
        <PaymentStatusBadge item={item} />
      </div>

      {item.payments.length ? (
        <ul className="space-y-1">
          {item.payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-2 text-xs">
              <span className={cn("text-ink-500", payment.anuladoAt && "line-through")}>
                {formatDate(payment.fecha)} · {methodLabel(payment.metodoPago)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn("font-semibold text-ink-700", payment.anuladoAt && "text-ink-400 line-through")}>
                  {currency(payment.monto)}
                </span>
                {!payment.anuladoAt && !isVoided ? (
                  <button
                    type="button"
                    onClick={() => voidPayment(payment)}
                    disabled={voidingPayment === payment.id}
                    className="rounded p-0.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    aria-label="Anular pago"
                    title="Anular pago (registrado por error)"
                  >
                    <FiX className="size-3.5" />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {!isVoided ? (
        <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-3">
          {item.saldo > 0 && onPay ? (
            <Button className="flex-1 rounded-xl px-3 py-2 text-xs font-medium shadow-none" onClick={onPay}>
              Registrar pago
            </Button>
          ) : null}
          {onExtend ? (
            <Button variant="secondary" className="flex-1 rounded-xl px-3 py-2 text-xs font-medium" onClick={onExtend}>
              Extender
            </Button>
          ) : null}
          {onVoid ? (
            <Button variant="ghost" className="rounded-xl px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50" onClick={onVoid}>
              Anular
            </Button>
          ) : null}
        </div>
      ) : null}
      {dialog}
    </article>
  );
}

function ExtendModal({ sale, onClose }: { sale: MemberPackageItem; onClose: () => void }) {
  const request = useStudioRequest();
  const [vence, setVence] = useState(sale.vence);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const saved = await request(
      `/api/member-packages/${sale.id}`,
      { method: "PUT", body: JSON.stringify({ vence }) },
      "Vencimiento actualizado"
    );
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Modal size="md"
      open
      onClose={() => (saving ? undefined : onClose())}
      title="Extender vencimiento"
      description={`${sale.nombre} · ${sale.discipline.nombre}. Hoy vence el ${formatDateKeyShort(sale.vence)}.`}
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="extend-vence">
            Nueva fecha de vencimiento
          </label>
          <input
            id="extend-vence"
            type="date"
            min={sale.inicio}
            value={vence}
            onChange={(event) => setVence(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 rounded-xl py-2.5 shadow-none"
            loading={saving}
            disabled={!vence || vence === sale.vence || vence < sale.inicio}
            onClick={submit}
          >
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function VoidModal({ sale, onClose }: { sale: MemberPackageItem; onClose: () => void }) {
  const request = useStudioRequest();
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const saved = await request(
      `/api/member-packages/${sale.id}`,
      { method: "PUT", body: JSON.stringify({ anular: true, motivo }) },
      "Venta anulada"
    );
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Modal size="md"
      open
      onClose={() => (saving ? undefined : onClose())}
      title="Anular venta"
      description={`${sale.nombre} · ${sale.discipline.nombre}. Sus pagos (${currency(sale.pagado)}) dejarán de contar como ingreso.`}
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="void-motivo">
            Motivo <span className="text-ink-400">(opcional)</span>
          </label>
          <input
            id="void-motivo"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Ej: se vendió por error"
            className={inputClass}
          />
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" className="flex-1 rounded-xl py-2.5" loading={saving} onClick={submit}>
            Anular venta
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Spec 007 R6: proximas reservas del cliente, con cancelar. */
function UpcomingBookings({ bookings }: { bookings: BookingItem[] }) {
  const request = useStudioRequest();
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function cancel(id: string) {
    setCancelling(id);
    await request(`/api/bookings/${id}`, { method: "PUT", body: JSON.stringify({ cancelar: true }) }, "Reserva cancelada");
    setCancelling(null);
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-ink-800">Próximas reservas</h2>
      <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white shadow-sm">
        {bookings.map((booking) => (
          <li key={booking.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <ColorDot color={booking.session.discipline.color} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-800">{booking.session.discipline.nombre}</p>
                <p className="text-xs text-ink-500">
                  {formatDateKeyShort(booking.session.fecha)} · {formatTimeKey(booking.session.horaInicio)}
                  {booking.estado !== "RESERVADA" ? ` · ${booking.estado === "ASISTIO" ? "Asistió" : "No asistió"}` : ""}
                </p>
              </div>
            </div>
            {booking.estado === "RESERVADA" ? (
              <Button
                variant="ghost"
                className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                loading={cancelling === booking.id}
                onClick={() => cancel(booking.id)}
              >
                Cancelar
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-400">
        La clase se devuelve si se cancela dentro del plazo configurado en Ajustes. Para hacer una excepción, cancela desde el
        Horario de clases.
      </p>
    </section>
  );
}

const CLASS_STATUS: Record<ClassHistoryItem["estado"], { label: string; className: string }> = {
  RESERVADA: { label: "Reservada", className: "bg-ink-100 text-ink-600" },
  ASISTIO: { label: "Asistió", className: "bg-brand-50 text-brand-700" },
  NO_ASISTIO: { label: "No asistió", className: "bg-rose-50 text-rose-700" },
  CANCELADA: { label: "Cancelada", className: "bg-ink-50 text-ink-400" }
};

/** Spec 019 R9: las clases de un plan; las proximas arriba, las pasadas despues. */
function PackageClasses({ classes, today }: { classes: ClassHistoryItem[]; today: string }) {
  const upcoming = classes.filter((entry) => entry.fecha >= today && entry.estado === "RESERVADA").reverse();
  const past = classes.filter((entry) => !upcoming.includes(entry));

  return (
    <details className="rounded-xl border border-ink-100 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-ink-600">{`Clases (${classes.length})`}</summary>
      <ul className="mt-2 space-y-1.5">
        {[...upcoming, ...past].map((entry) => {
          const status = CLASS_STATUS[entry.estado];
          const detail =
            entry.estado === "CANCELADA"
              ? entry.claseDevuelta
                ? "clase devuelta"
                : "sin devolución"
              : entry.estado === "NO_ASISTIO" && entry.claseDevuelta
                ? "clase devuelta"
                : entry.sinReserva
                  ? "llegó sin reservar"
                  : null;
          return (
            <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-ink-600">
                <ColorDot color={entry.discipline.color} className="size-2" />
                <span className="truncate">
                  {formatDateKeyShort(entry.fecha)} · {entry.discipline.nombre} {formatTimeKey(entry.horaInicio)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {detail ? <span className="text-[11px] text-ink-400">{detail}</span> : null}
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.className)}>{status.label}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
