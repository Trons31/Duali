"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { clientApiFetch } from "@/lib/client-api";
import {
  FiArrowLeft,
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiEdit2,
  FiMail,
  FiMessageCircle,
  FiMoreHorizontal,
  FiPlus,
  FiTrash2,
  FiX
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/components/ui/use-confirm";
import { Modal } from "@/components/ui/modal";
import { PAYMENT_METHODS } from "@/components/ui/payment-method-modal";
import { ColorDot, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import {
  ClassesBar,
  MemberFormModal,
  OnlineBadge,
  PackageStatusBadge,
  PaymentStatusBadge,
  RegisterPaymentModal,
  RenewPackageModal,
  RenewalNote,
  SellPackageModal,
  formatClassDate,
  formatDateKeyShort,
  memberName,
  whatsappLink
} from "@/components/dashboard/studio-sales-ui";
import { cn, currency, formatDate, formatDateTime } from "@/lib/web-utils";
import { ReceiptReviewList, ReceiptReviewModal } from "@/components/dashboard/receipt-review-list";
import type { ClassHistoryItem } from "@/lib/attendance";
import type { ReceiptView } from "@/lib/receipts";
import type { ReminderItem } from "@/lib/studio-reminders";
import { formatTimeKey } from "@/lib/studio-time";
import type { BookingItem, DisciplineItem, MemberPackageItem, PackageItem, StudioMemberItem } from "@/lib/web-types";

/** Spec 020 R7: un plan vencido sigue a la vista para renovarlo hasta 60 dias (RENEWAL_WINDOW_DAYS en el servidor). */
const RENEWAL_WINDOW_DAYS = 60;

const methodLabel = (value: string) => PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;

type MemberRef = { nombre: string; celular: string };

/** Ficha de un cliente del estudio (spec 006 R6/R7; diseño de la spec 022). */
export function StudioMemberDetail({
  member,
  today,
  disciplines,
  packages,
  bookings,
  receipts = [],
  classHistory = [],
  diasPlazoSaldo = 7,
  reminders = {}
}: {
  member: StudioMemberItem;
  today: string;
  disciplines: DisciplineItem[];
  packages: PackageItem[];
  bookings: BookingItem[];
  receipts?: ReceiptView[];
  classHistory?: ClassHistoryItem[];
  diasPlazoSaldo?: number;
  reminders?: Record<string, ReminderItem>;
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
  const [renewing, setRenewing] = useState<MemberPackageItem | null>(null);

  // Primero lo que importa hoy: vigentes, con saldo o por renovar (spec 020 R3); despues la historia.
  const current = member.packages.filter(
    (item) => item.estado === "ACTIVO" || item.saldo > 0 || (item.puedeRenovar && item.diasVencido <= RENEWAL_WINDOW_DAYS)
  );
  const history = member.packages.filter((item) => !current.includes(item));
  const pending = receipts.filter((receipt) => receipt.estado === "POR_REVISAR");
  // Spec 022 D3: cada comprobante va en la pestana del plan que paga; los de planes ya cerrados, aparte.
  const looseReceipts = pending.filter((receipt) => !current.some((item) => item.id === receipt.sale.id));
  const lastPlan = history.find((item) => item.puedeRenovar);
  const pendingFor = (saleId: string) => pending.filter((receipt) => receipt.sale.id === saleId).length;
  // Spec 022 D5: un plan a la vez; empieza en el que tiene algo por revisar.
  const [selectedId, setSelectedId] = useState(() => (current.find((item) => pendingFor(item.id)) ?? current[0])?.id);
  const selected = current.find((item) => item.id === selectedId) ?? current[0];

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

      <MemberHeader member={member} onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)} />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3 lg:items-start">
        <section className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
              {current.length > 1 ? `Planes actuales (${current.length})` : "Plan actual"}
            </h2>
            <Button className="rounded-xl px-4 py-2 font-medium shadow-none" onClick={() => setSelling(true)}>
              <FiPlus className="size-4" />
              Vender paquete
            </Button>
          </div>

          {current.length > 1 ? <PlanSwitcher items={current} selectedId={selected.id} pendingFor={pendingFor} onSelect={setSelectedId} /> : null}

          {selected ? (
            <PlanCard
              key={selected.id}
              item={selected}
              member={member}
              today={today}
              classes={classHistory.filter((entry) => entry.memberPackageId === selected.id)}
              receipts={receipts.filter((receipt) => receipt.sale.id === selected.id)}
              reminder={reminders[selected.id]}
              onPay={() => setPaying(selected)}
              onExtend={() => setExtending(selected)}
              onVoid={() => setVoiding(selected)}
              onRenew={() => setRenewing(selected)}
            />
          ) : (
            <div className="flex flex-col items-center rounded-2xl border border-ink-200 bg-white px-6 py-10 text-center shadow-sm">
              <p className="font-semibold text-ink-800">Sin plan vigente</p>
              <p className="mt-1 text-sm text-ink-500">Véndele un paquete o una clase suelta.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {lastPlan ? (
                  <Button className="min-h-11 rounded-xl px-4 font-medium shadow-none" onClick={() => setRenewing(lastPlan)}>
                    Renovar {lastPlan.nombre}
                  </Button>
                ) : null}
                <Button variant="secondary" className="min-h-11 rounded-xl px-4 font-medium" onClick={() => setSelling(true)}>
                  Vender paquete
                </Button>
              </div>
            </div>
          )}

          {history.length ? (
            <PlanHistory items={history} today={today} classHistory={classHistory} receipts={receipts} onExtend={setExtending} />
          ) : null}
        </section>

        <aside className="space-y-4">
          {looseReceipts.length ? (
            <Panel title="Comprobantes por revisar">
              <div className="p-3">
                <ReceiptReviewList receipts={looseReceipts} showMember={false} />
              </div>
            </Panel>
          ) : null}
          <UpcomingBookings bookings={bookings} />
          <Panel
            title="Notas"
            action={
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-brand-600 hover:underline">
                {member.notas ? "Editar" : "Agregar"}
              </button>
            }
          >
            <p className={cn("px-4 py-3 text-sm", member.notas ? "whitespace-pre-line text-ink-600" : "text-ink-400")}>
              {member.notas || "Sin notas. Anota preferencias, lesiones o lo que quieras recordar."}
            </p>
          </Panel>
        </aside>
      </div>

      {editing ? <MemberFormModal member={member} onClose={() => setEditing(false)} /> : null}
      {selling ? (
        <SellPackageModal
          memberId={member.id}
          memberLabel={memberName(member)}
          today={today}
          disciplines={disciplines}
          packages={packages}
          diasPlazoSaldo={diasPlazoSaldo}
          onClose={() => setSelling(false)}
        />
      ) : null}
      {renewing ? (
        <RenewPackageModal
          sale={renewing}
          memberLabel={memberName(member)}
          today={today}
          packages={packages}
          diasPlazoSaldo={diasPlazoSaldo}
          onClose={() => setRenewing(null)}
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

/** Spec 022 R1: quien es y lo que la duena pregunta primero. */
function MemberHeader({ member, onEdit, onDelete }: { member: StudioMemberItem; onEdit: () => void; onDelete: () => void }) {
  const owing = member.packages.filter((item) => item.saldo > 0);
  const overdue = owing.some((item) => item.saldoVencido);
  const nextDeadline = owing.map((item) => item.fechaLimitePago).sort()[0];
  const since = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric", timeZone: "America/Bogota" }).format(new Date(member.createdAt));

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
      {/* Spec 025: en el celular los botones bajan a su fila y el nombre usa todo el ancho. */}
      <div className="flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap sm:items-center sm:p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-700">
          {member.nombre.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-bold leading-tight text-ink-900">{memberName(member)}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
            <span className="tabular-nums">{member.celular}</span>
            {member.email ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <FiMail className="size-3.5 shrink-0" />
                <span className="truncate">{member.email}</span>
              </span>
            ) : null}
            {member.fechaNacimiento ? (
              <span className="inline-flex items-center gap-1">
                <FiCalendar className="size-3.5" />
                cumple {formatDateKeyShort(member.fechaNacimiento)}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
          <a
            href={whatsappLink(member.celular)}
            target="_blank"
            rel="noreferrer"
            aria-label="Escribir por WhatsApp"
            className="inline-flex min-h-10 min-w-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-200 px-3 text-sm font-medium text-ink-700 transition hover:border-brand-300 hover:text-brand-700 sm:flex-none"
          >
            <FiMessageCircle className="size-4 shrink-0" />
            <span>WhatsApp</span>
          </a>
          <Button variant="secondary" className="min-h-10 flex-1 rounded-xl px-3 font-medium sm:flex-none" onClick={onEdit} aria-label="Editar cliente">
            <FiEdit2 className="size-4" />
            <span>Editar</span>
          </Button>
          <ActionMenu label="Más opciones del cliente" items={[{ label: "Eliminar cliente", danger: true, onSelect: onDelete, icon: <FiTrash2 /> }]} />
        </div>
      </div>

      <dl className="grid grid-cols-2 border-t border-ink-100 sm:grid-cols-4">
        <Metric label="clases disponibles">
          <span className="text-2xl font-black tabular-nums text-ink-900">{member.clasesDisponibles}</span>
        </Metric>
        <Metric label={member.proxima ? `próxima · ${member.proxima.disciplina}` : "próxima clase"}>
          <span className="block text-sm font-bold text-ink-900 first-letter:uppercase">
            {member.proxima ? formatClassDate(member.proxima.fecha, member.proxima.horaInicio) : "Sin reservas"}
          </span>
        </Metric>
        <Metric label={member.saldo > 0 ? (overdue ? "saldo vencido" : `debe · antes del ${formatDateKeyShort(nextDeadline)}`) : "saldo"}>
          <span className={cn("text-2xl font-black tabular-nums", member.saldo > 0 ? (overdue ? "text-rose-600" : "text-amber-700") : "text-ink-900")}>
            {member.saldo > 0 ? currency(member.saldo) : "Al día"}
          </span>
        </Metric>
        <Metric label="cliente desde">
          <span className="block text-sm font-bold text-ink-900 first-letter:uppercase">{since}</span>
        </Metric>
      </dl>
    </section>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-ink-100 px-4 py-3 odd:border-r sm:border-r sm:px-6 sm:last:border-r-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0">
      <dd className="flex min-h-8 items-end">{children}</dd>
      <dt className="mt-0.5 text-xs text-ink-500 first-letter:uppercase">{label}</dt>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-ink-100 px-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Spec 022 D5: con varios planes, uno a la vez; el globo avisa el comprobante sin validar. */
function PlanSwitcher({
  items,
  selectedId,
  pendingFor,
  onSelect
}: {
  items: MemberPackageItem[];
  selectedId: string;
  pendingFor: (saleId: string) => number;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Planes del cliente" className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3">
      {items.map((item) => {
        const active = item.id === selectedId;
        const count = pendingFor(item.id);
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.id)}
            className={cn(
              "relative w-60 shrink-0 snap-start rounded-2xl border bg-white px-3.5 py-3 text-left transition sm:w-auto",
              active ? "border-brand-500 ring-2 ring-brand-100" : "border-ink-200 hover:border-ink-300"
            )}
          >
            <span className="flex items-center gap-2 pr-6">
              <ColorDot color={item.discipline.color} className="size-2.5" />
              <span className="truncate text-sm font-semibold text-ink-800">
                {item.claseSuelta ? `Clase suelta · ${item.discipline.nombre}` : `${item.nombre} · ${item.discipline.nombre}`}
              </span>
            </span>
            <span className="mt-0.5 block truncate pl-[18px] text-xs text-ink-500">{planSummary(item)}</span>
            {count ? <CountBadge count={count} className="absolute right-3 top-3" label={`${count} comprobante por revisar`} /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Lo que mas importa de un plan, en una linea (selector de planes). */
function planSummary(item: MemberPackageItem) {
  if (item.situacionPago === "EN_REVISION") return "Pago en revisión";
  if (item.saldoVencido) return `Saldo vencido · ${currency(item.saldo)}`;
  if (item.estado === "VENCIDO") return "Vencido";
  if (item.estado === "AGOTADO") return "Sin clases";
  if (item.claseSuelta) return item.clase ? formatClassDate(item.clase.fecha, item.clase.horaInicio) : "Sin usar";
  return `Quedan ${item.clasesRestantes} de ${item.clases}`;
}

function CountBadge({ count, label, className }: { count: number; label: string; className?: string }) {
  return (
    <span
      aria-label={label}
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white", className)}
    >
      {count}
    </span>
  );
}

type PlanCardProps = {
  item: MemberPackageItem;
  member: MemberRef;
  today: string;
  classes: ClassHistoryItem[];
  receipts: ReceiptView[];
  reminder?: ReminderItem;
  onPay: () => void;
  onExtend: () => void;
  onVoid: () => void;
  onRenew: () => void;
};

type PlanTab = "pagos" | "comprobantes" | "clases";

/** Spec 022 R2–R4: el plan a todo lo ancho, con una accion principal y sus pestanas. */
function PlanCard({ item, member, today, classes, receipts, reminder, onPay, onExtend, onVoid, onRenew }: PlanCardProps) {
  const sendMyPlan = useSendMyPlan();
  const sendReminder = useSendReminder();
  const [reminded, setReminded] = useState(Boolean(reminder?.enviadoAt));
  const pendingCount = receipts.filter((receipt) => receipt.estado === "POR_REVISAR").length;
  // D3: con un comprobante sin validar, la pestana Comprobantes se abre sola.
  const [tab, setTab] = useState<PlanTab>(pendingCount ? "comprobantes" : "pagos");
  const tabsRef = useRef<HTMLDivElement>(null);
  const paidPercent = item.precio > 0 ? Math.min((item.pagado / item.precio) * 100, 100) : 100;

  function reviewReceipts() {
    setTab("comprobantes");
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Spec 022 D2: una sola accion principal.
  const actions: Array<{ key: string; label: string; onClick: () => void }> = [];
  if (pendingCount) actions.push({ key: "review", label: pendingCount > 1 ? `Revisar comprobantes (${pendingCount})` : "Revisar comprobante", onClick: reviewReceipts });
  if (item.saldo > 0) actions.push({ key: "pay", label: "Registrar pago", onClick: onPay });
  if (item.puedeRenovar) actions.push({ key: "renew", label: "Renovar", onClick: onRenew });
  const [primary, ...secondary] = actions;

  const menu: MenuItem[] = [
    { label: "Extender vencimiento", onSelect: onExtend, icon: <FiCalendar /> },
    { label: "Enviar Mi plan por WhatsApp", onSelect: () => sendMyPlan(item.id, member), icon: <FiMessageCircle /> },
    ...(reminder
      ? [
          {
            label: reminded ? "Avisar otra vez por WhatsApp" : "Avisar por WhatsApp",
            hint: reminder.detalle,
            onSelect: () => {
              setReminded(true);
              sendReminder(reminder);
            },
            icon: <FiMessageCircle />
          }
        ]
      : []),
    { label: "Anular venta", danger: true, onSelect: onVoid, icon: <FiX /> }
  ];

  return (
    <article className="rounded-2xl border border-ink-200 bg-white shadow-sm">
      <div className="space-y-4 p-4 sm:p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-ink-900">
              <ColorDot color={item.discipline.color} />
              <span className="truncate">
                {item.nombre} · {item.discipline.nombre}
              </span>
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
              {formatDateKeyShort(item.inicio)} – {formatDateKeyShort(item.vence)}
              <OnlineBadge item={item} />
            </p>
            <div className="mt-1">
              <RenewalNote item={item} />
            </div>
          </div>
          <PackageStatusBadge item={item} />
        </header>

        <ClassesBar item={item} legend />

        <div className="rounded-xl bg-ink-50/70 px-3 py-2.5">
          <p className="text-xs text-ink-600">
            Pagado <span className="font-semibold tabular-nums text-ink-800">{currency(item.pagado)}</span> de{" "}
            <span className="tabular-nums">{currency(item.precio)}</span>
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200/70" aria-hidden>
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${paidPercent}%` }} />
          </div>
          <div className="mt-1.5">
            <PaymentStatusBadge item={item} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {primary ? (
            <Button className="min-h-11 rounded-xl px-5 font-medium shadow-none" onClick={primary.onClick}>
              {primary.label}
            </Button>
          ) : (
            <Link
              href="/dashboard/horario"
              className="inline-flex min-h-11 items-center rounded-xl border border-ink-200 px-4 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              Reservar clase
            </Link>
          )}
          {secondary.map((action) => (
            <Button key={action.key} variant="secondary" className="min-h-11 rounded-xl px-4 font-medium" onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
          <div className="ml-auto">
            <ActionMenu label="Más acciones del plan" text="Más" items={menu} />
          </div>
        </div>
      </div>

      <div ref={tabsRef} className="scroll-mt-4">
        <PlanTabs item={item} receipts={receipts} classes={classes} today={today} tab={tab} onTab={setTab} />
      </div>
    </article>
  );
}

/** Spec 022 R4: Pagos · Comprobantes · Clases de un plan. */
function PlanTabs({
  item,
  receipts,
  classes,
  today,
  tab,
  onTab
}: {
  item: MemberPackageItem;
  receipts: ReceiptView[];
  classes: ClassHistoryItem[];
  today: string;
  tab: PlanTab;
  onTab: (tab: PlanTab) => void;
}) {
  const validPayments = item.payments.filter((payment) => !payment.anuladoAt).length;
  const pendingCount = receipts.filter((receipt) => receipt.estado === "POR_REVISAR").length;
  const tabs: Array<{ value: PlanTab; label: string; count?: number }> = [
    { value: "pagos", label: `Pagos (${validPayments})` },
    { value: "comprobantes", label: pendingCount ? "Comprobantes" : `Comprobantes (${receipts.length})`, count: pendingCount },
    ...(item.claseSuelta ? [] : [{ value: "clases" as const, label: `Clases (${classes.length})` }])
  ];
  const active = tabs.some((entry) => entry.value === tab) ? tab : "pagos";

  return (
    <div className="border-t border-ink-100">
      <div role="tablist" aria-label="Detalle del plan" className="flex gap-1 overflow-x-auto border-b border-ink-100 px-2 sm:px-3">
        {tabs.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={active === entry.value}
            onClick={() => onTab(entry.value)}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400",
              active === entry.value ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800"
            )}
          >
            {entry.label}
            {entry.count ? <CountBadge count={entry.count} label={`${entry.count} por revisar`} /> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="px-4 py-1 sm:px-5">
        {active === "pagos" ? <PaymentsList item={item} /> : null}
        {active === "comprobantes" ? <ReceiptsList receipts={receipts} /> : null}
        {active === "clases" ? <ClassesList classes={classes} today={today} /> : null}
      </div>
    </div>
  );
}

const RECEIPT_STATE: Record<ReceiptView["estado"], { label: string; className: string }> = {
  POR_REVISAR: { label: "Por revisar", className: "bg-amber-50 text-amber-800" },
  APROBADO: { label: "Aprobado", className: "bg-brand-50 text-brand-700" },
  RECHAZADO: { label: "Rechazado", className: "bg-rose-50 text-rose-700" }
};

/** Spec 022 D3: los comprobantes del plan; los que esperan, primero y con Aprobar/Rechazar. */
function ReceiptsList({ receipts }: { receipts: ReceiptView[] }) {
  const [reviewing, setReviewing] = useState<{ receipt: ReceiptView; action: "approve" | "reject" } | null>(null);
  const ordered = [...receipts].sort((a, b) => Number(b.estado === "POR_REVISAR") - Number(a.estado === "POR_REVISAR"));

  if (!receipts.length) {
    return <p className="py-4 text-sm text-ink-400">Sin comprobantes. Los que envíe al comprar en línea o desde Mi plan aparecen aquí.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-ink-100">
        {ordered.map((receipt) => {
          const state = RECEIPT_STATE[receipt.estado];
          return (
            <li key={receipt.id} className="flex gap-3 py-3">
              <a href={receipt.url} target="_blank" rel="noopener noreferrer" title="Ver comprobante completo" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={receipt.url} alt="Comprobante" loading="lazy" className="size-16 rounded-lg bg-ink-50 object-cover ring-1 ring-black/5" />
              </a>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-ink-800">{receipt.metodoPago || "Transferencia"}</p>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", state.className)}>{state.label}</span>
                </div>
                <p className="text-xs text-ink-500">Enviado {formatDateTime(receipt.createdAt)}</p>
                {receipt.estado === "RECHAZADO" && receipt.motivoRechazo ? (
                  <p className="mt-0.5 text-xs text-rose-600">Motivo: {receipt.motivoRechazo}</p>
                ) : null}
                {receipt.estado === "POR_REVISAR" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button className="min-h-10 rounded-xl px-4 text-sm font-medium shadow-none" onClick={() => setReviewing({ receipt, action: "approve" })}>
                      <FiCheck className="size-4" />
                      Aprobar {currency(receipt.sale.saldo)}
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-10 rounded-xl px-3 text-sm font-medium text-rose-600 hover:bg-rose-50"
                      onClick={() => setReviewing({ receipt, action: "reject" })}
                    >
                      Rechazar
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {reviewing ? <ReceiptReviewModal receipt={reviewing.receipt} action={reviewing.action} onClose={() => setReviewing(null)} /> : null}
    </>
  );
}

/** Spec 022 R4: los pagos; el anulado dice "Anulado" y no se cuenta. */
function PaymentsList({ item }: { item: MemberPackageItem }) {
  const request = useStudioRequest();
  const { confirm, dialog } = useConfirm();
  const [voidingPayment, setVoidingPayment] = useState<string | null>(null);
  const valid = item.payments.filter((payment) => !payment.anuladoAt);
  const voided = item.payments.length - valid.length;
  const isVoided = item.estado === "ANULADO";
  // Spec 020 R6: "abono 1 de 2", del primero al ultimo (payments viene del mas reciente).
  const number = (id: string) => valid.length - valid.findIndex((payment) => payment.id === id);

  // Spec 019 R2: anular un pago pide confirmacion y dice que pasa con el saldo.
  async function voidPayment(payment: MemberPackageItem["payments"][number]) {
    const ok = await confirm({
      title: "¿Anular este pago?",
      description: `${currency(payment.monto)} del ${formatDate(payment.fecha)} · ${methodLabel(payment.metodoPago)}`,
      notice: `La venta quedará debiendo ${currency(item.saldo + payment.monto)}. El pago queda en el historial como anulado; úsalo solo si se registró por error.`,
      confirmText: "Anular pago"
    });
    if (!ok) return;
    setVoidingPayment(payment.id);
    await request(`/api/member-packages/${item.id}/payments/${payment.id}`, { method: "DELETE" }, "Pago anulado");
    setVoidingPayment(null);
  }

  if (!item.payments.length) return <p className="py-4 text-sm text-ink-400">Aún no hay pagos.</p>;

  return (
    <>
      <ul className="divide-y divide-ink-100">
        {item.payments.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0">
              <span className={cn("block text-ink-700", payment.anuladoAt && "text-ink-400")}>
                {formatDate(payment.fecha)} · {methodLabel(payment.metodoPago)}
              </span>
              {!payment.anuladoAt && valid.length > 1 ? (
                <span className="block text-xs text-ink-400">
                  abono {number(payment.id)} de {valid.length}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {payment.anuladoAt ? <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-500">Anulado</span> : null}
              <span className={cn("font-semibold tabular-nums text-ink-800", payment.anuladoAt && "font-normal text-ink-400 line-through")}>
                {currency(payment.monto)}
              </span>
              {!payment.anuladoAt && !isVoided ? (
                <button
                  type="button"
                  onClick={() => voidPayment(payment)}
                  disabled={voidingPayment === payment.id}
                  className="rounded-lg p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
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
      {voided ? (
        <p className="border-t border-ink-100 py-2 text-xs text-ink-400">
          {voided === 1 ? "1 pago anulado no cuenta" : `${voided} pagos anulados no cuentan`} en lo pagado.
        </p>
      ) : null}
      {dialog}
    </>
  );
}

/** Spec 022 R5: los planes que ya pasaron, en filas; tocar una muestra su detalle. */
function PlanHistory({
  items,
  today,
  classHistory,
  receipts,
  onExtend
}: {
  items: MemberPackageItem[];
  today: string;
  classHistory: ClassHistoryItem[];
  receipts: ReceiptView[];
  onExtend: (item: MemberPackageItem) => void;
}) {
  return (
    <section className="space-y-3 pt-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Historial de planes ({items.length})</h2>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        {items.map((item) => (
          <li key={item.id}>
            <details className="group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-ink-50/60 [&::-webkit-details-marker]:hidden">
                <ColorDot color={item.discipline.color} className="size-2.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-800">
                    {item.claseSuelta ? `Clase suelta · ${item.discipline.nombre}` : `${item.nombre} · ${item.discipline.nombre}`}
                  </span>
                  <span className="block text-xs text-ink-500">
                    {formatDateKeyShort(item.inicio)} – {formatDateKeyShort(item.vence)}
                  </span>
                </span>
                <span className="hidden sm:block">
                  <PackageStatusBadge item={item} />
                </span>
                <span className="hidden w-24 text-right text-xs font-semibold text-ink-500 sm:block">
                  {item.estado === "ANULADO" ? "" : item.saldo > 0 ? `Debe ${currency(item.saldo)}` : "Pagado"}
                </span>
                <FiChevronRight className="size-4 shrink-0 text-ink-300 transition group-open:rotate-90" />
              </summary>
              <HistoryDetail
                item={item}
                today={today}
                classes={classHistory.filter((entry) => entry.memberPackageId === item.id)}
                receipts={receipts.filter((receipt) => receipt.sale.id === item.id)}
                onExtend={() => onExtend(item)}
              />
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoryDetail({
  item,
  today,
  classes,
  receipts,
  onExtend
}: {
  item: MemberPackageItem;
  today: string;
  classes: ClassHistoryItem[];
  receipts: ReceiptView[];
  onExtend: () => void;
}) {
  const [tab, setTab] = useState<PlanTab>("pagos");
  return (
    <div className="space-y-3 border-t border-ink-100 bg-ink-50/40 px-4 py-3">
      <div className="sm:hidden">
        <PackageStatusBadge item={item} />
      </div>
      <RenewalNote item={item} />
      {item.estado === "ANULADO" ? (
        <p className="text-xs text-ink-500">Anulada{item.motivoAnulacion ? `: ${item.motivoAnulacion}` : ""}.</p>
      ) : (
        <ClassesBar item={item} legend />
      )}
      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
        <PlanTabs item={item} receipts={receipts} classes={classes} today={today} tab={tab} onTab={setTab} />
      </div>
      {item.estado !== "ANULADO" ? (
        <Button variant="secondary" className="min-h-10 rounded-xl px-4 text-sm font-medium" onClick={onExtend}>
          Extender vencimiento
        </Button>
      ) : null}
    </div>
  );
}

type MenuItem = { label: string; onSelect: () => void; icon?: ReactNode; danger?: boolean; hint?: string };

/** Menu "Mas" (spec 022 D2). Se cierra al elegir, al tocar fuera o con Escape. */
function ActionMenu({ label, text, items }: { label: string; text?: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 text-sm font-medium text-ink-700 transition hover:bg-ink-50",
          text ? "min-h-11 px-4" : "size-10"
        )}
      >
        {text ?? <FiMoreHorizontal className="size-4" />}
        {text ? <FiChevronDown className={cn("size-4 text-ink-400 transition", open && "rotate-180")} /> : null}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm",
                item.danger ? "text-rose-600 hover:bg-rose-50" : "text-ink-700 hover:bg-ink-50"
              )}
            >
              {item.icon ? <span className="mt-0.5 flex size-4 shrink-0 [&>svg]:size-4">{item.icon}</span> : null}
              <span className="min-w-0">
                <span className="block font-medium">{item.label}</span>
                {item.hint ? <span className="block truncate text-xs text-ink-400">{item.hint}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
    <Panel title="Próximas clases">
      {bookings.length ? (
        <>
          <ul className="divide-y divide-ink-100">
            {bookings.map((booking) => (
              <li key={booking.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <ColorDot color={booking.session.discipline.color} className="size-2.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-800 first-letter:uppercase">
                      {formatClassDate(booking.session.fecha, booking.session.horaInicio)}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {booking.session.discipline.nombre}
                      {booking.estado !== "RESERVADA" ? ` · ${booking.estado === "ASISTIO" ? "Asistió" : "No asistió"}` : ""}
                    </p>
                  </div>
                </div>
                {booking.estado === "RESERVADA" ? (
                  <Button
                    variant="ghost"
                    className="shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    loading={cancelling === booking.id}
                    onClick={() => cancel(booking.id)}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="border-t border-ink-100 px-4 py-2 text-[11px] leading-relaxed text-ink-400">
            Se devuelve la clase si cancela dentro del plazo de Ajustes. Para una excepción, cancela desde el Horario.
          </p>
        </>
      ) : (
        <div className="px-4 py-4 text-sm text-ink-400">
          Sin clases reservadas.{" "}
          <Link href="/dashboard/horario" className="font-medium text-brand-600 hover:underline">
            Reservar desde el horario
          </Link>
        </div>
      )}
    </Panel>
  );
}

const CLASS_STATUS: Record<ClassHistoryItem["estado"], { label: string; className: string }> = {
  RESERVADA: { label: "Reservada", className: "bg-ink-100 text-ink-600" },
  ASISTIO: { label: "Asistió", className: "bg-brand-50 text-brand-700" },
  NO_ASISTIO: { label: "No asistió", className: "bg-rose-50 text-rose-700" },
  CANCELADA: { label: "Cancelada", className: "bg-ink-50 text-ink-400" }
};

/** Spec 019 R9: las clases de un plan; las proximas arriba, las pasadas despues. */
function ClassesList({ classes, today }: { classes: ClassHistoryItem[]; today: string }) {
  const upcoming = classes.filter((entry) => entry.fecha >= today && entry.estado === "RESERVADA").reverse();
  const past = classes.filter((entry) => !upcoming.includes(entry));

  if (!classes.length) return <p className="py-4 text-sm text-ink-400">Aún no ha usado clases de este plan.</p>;

  return (
    <ul className="divide-y divide-ink-100">
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
          <li key={entry.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink-700">
              <ColorDot color={entry.discipline.color} className="size-2" />
              <span className="truncate">
                {formatDateKeyShort(entry.fecha)} · {entry.discipline.nombre} {formatTimeKey(entry.horaInicio)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {detail ? <span className="hidden text-xs text-ink-400 sm:inline">{detail}</span> : null}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.className)}>{status.label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Spec 021 R10: manda a la clienta su enlace Mi plan. La ventana se abre antes
 * de pedir el enlace para que el navegador no la bloquee.
 */
function useSendMyPlan() {
  const { data: session } = useSession();
  return async (saleId: string, member: MemberRef) => {
    const token = session?.user.apiToken;
    if (!token) return;
    const popup = window.open("", "_blank");
    try {
      const { path } = await clientApiFetch<{ path: string }>(`/api/member-packages/${saleId}/access-link`, token, { method: "POST" });
      const message = `Hola ${member.nombre}, este es tu enlace de Mi plan: ${window.location.origin}${path}
Ahí ves cuántas clases te quedan, tus reservas y tu pago, y reservas sin escribir tus datos.`;
      const url = `${whatsappLink(member.celular)}?text=${encodeURIComponent(message)}`;
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (error) {
      popup?.close();
      sileo.error({ title: (error as Error).message });
    }
  };
}

/** Spec 020 R9: el aviso que toca; marca el envio igual que en Avisos. */
function useSendReminder() {
  const { data: session } = useSession();
  return async (reminder: ReminderItem) => {
    window.open(reminder.href, "_blank", "noopener,noreferrer");
    const token = session?.user.apiToken;
    if (!token) return;
    await clientApiFetch("/api/studio-reminders/sent", token, {
      method: "POST",
      body: JSON.stringify({ tipo: reminder.tipo, refKey: reminder.refKey, memberId: reminder.member.id })
    }).catch(() => undefined);
  };
}
