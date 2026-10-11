"use client";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { FiCheck, FiX } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ModalSteps, PaymentSummary } from "@/components/ui/modal-steps";
import { MoneyInput } from "@/components/ui/money-input";
import { PaymentBreakdown, paymentPayload, usePaymentParts } from "@/components/ui/payment-breakdown";
import { paymentPartsError } from "@/lib/payment-breakdown";
import { ColorDot, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import { addDaysToKey, dateKeyToDate, formatTimeKey } from "@/lib/studio-time";
import { cn, currency } from "@/lib/web-utils";
import type { DisciplineItem, MemberPackageItem, PackageItem, StudioMemberItem } from "@/lib/web-types";

// Piezas de clientes y ventas del estudio (specs 006 y 019).

export function memberName(member: { nombre: string; apellido: string | null }) {
  return member.apellido ? `${member.nombre} ${member.apellido}` : member.nombre;
}

export function formatDateKeyShort(key: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(dateKeyToDate(key));
}

export function whatsappLink(celular: string) {
  return `https://wa.me/${celular.length === 10 ? `57${celular}` : celular}`;
}

export function daysLabel(days: number) {
  return days === 1 ? "1 día" : `${days} días`;
}

/** Spec 020 R1: la vigencia con dias (vence en, vencio hace, renovado). */
export function PackageStatusBadge({ item }: { item: MemberPackageItem }) {
  if (item.claseSuelta) return <DropInStatusBadge item={item} />;
  const { label, className } =
    item.estado === "ANULADO"
      ? { label: "Anulado", className: "bg-ink-100 text-ink-500" }
      : item.renovadoPor
        ? { label: "Renovado", className: "bg-ink-100 text-ink-600" }
        : item.estado === "VENCIDO"
          ? { label: `Venció hace ${daysLabel(item.diasVencido)}`, className: "bg-rose-50 text-rose-700" }
          : item.estado === "AGOTADO"
            ? { label: `Usó sus ${item.clases} clases`, className: "bg-ink-100 text-ink-600" }
            : item.porVencer
              ? {
                  label: item.diasParaVencer <= 0 ? "Vence hoy" : item.diasParaVencer === 1 ? "Vence mañana" : `Vence en ${daysLabel(item.diasParaVencer)}`,
                  className: "bg-amber-50 text-amber-700"
                }
              : item.pocasClases
                ? { label: `Quedan ${item.clasesRestantes}`, className: "bg-amber-50 text-amber-700" }
                : { label: "Vigente", className: "bg-brand-50 text-brand-700" };

  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", className)}>{label}</span>;
}

export function PaymentStatusBadge({ item }: { item: MemberPackageItem }) {
  if (item.estado === "ANULADO") return null;
  if (item.saldo <= 0) return <span className="text-[11px] font-semibold text-brand-600">Pagado</span>;
  // Spec 021: lo que falta por hacer con el pago de una compra en linea.
  if (item.situacionPago === "EN_REVISION") return <span className="text-[11px] font-semibold text-amber-700">Pago en revisión · {currency(item.saldo)}</span>;
  // Spec 020 R2: el saldo con su fecha limite.
  if (item.saldoVencido) {
    return (
      <span className="text-[11px] font-semibold text-rose-600">
        Saldo vencido hace {daysLabel(item.diasAtrasoSaldo)} · {currency(item.saldo)}
      </span>
    );
  }
  if (item.situacionPago === "RECHAZADO") return <span className="text-[11px] font-semibold text-rose-600">Comprobante rechazado · debe {currency(item.saldo)}</span>;
  if (item.situacionPago === "PAGO_EN_ESTUDIO") return <span className="text-[11px] font-semibold text-rose-600">Paga en el estudio {currency(item.saldo)}</span>;
  return (
    <span className="text-[11px] font-semibold text-rose-600">
      Debe {currency(item.saldo)} <span className="font-normal text-ink-500">· paga antes del {formatDateKeyShort(item.fechaLimitePago)}</span>
    </span>
  );
}

/** Spec 020 R4: de donde viene una renovacion y en que sigue un plan renovado. */
export function RenewalNote({ item }: { item: Pick<MemberPackageItem, "renovadoPor" | "renovacionDe" | "estado"> }) {
  if (item.estado === "ANULADO") return null;
  if (item.renovadoPor) {
    return (
      <p className="text-[11px] text-ink-500">
        Renovado · sigue {item.renovadoPor.nombre} hasta {formatDateKeyShort(item.renovadoPor.vence)}
      </p>
    );
  }
  if (item.renovacionDe) {
    return (
      <p className="text-[11px] text-ink-500">
        Renovación de {item.renovacionDe.nombre} ({formatDateKeyShort(item.renovacionDe.inicio)} – {formatDateKeyShort(item.renovacionDe.vence)})
      </p>
    );
  }
  return null;
}

/** Spec 021 R12: venta hecha desde la pagina publica. */
export function OnlineBadge({ item }: { item: Pick<MemberPackageItem, "origen"> }) {
  if (item.origen !== "PUBLICO") return null;
  return <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">Compró en línea</span>;
}

const CLASS_STATE: Record<string, { label: string; className: string }> = {
  RESERVADA: { label: "Reservada", className: "bg-sky-50 text-sky-700" },
  ASISTIO: { label: "Asistió", className: "bg-brand-50 text-brand-700" },
  NO_ASISTIO: { label: "No asistió", className: "bg-rose-50 text-rose-700" },
  CANCELADA: { label: "Canceló tarde", className: "bg-rose-50 text-rose-700" }
};

export function formatClassDate(fecha: string, horaInicio: string) {
  const day = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(dateKeyToDate(fecha));
  return `${day} · ${formatTimeKey(horaInicio)}`;
}

/** Spec 019 D2/R6: estado de una clase suelta (para que clase es y que paso). */
export function DropInStatusBadge({ item }: { item: MemberPackageItem }) {
  if (item.estado === "ANULADO") return <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">Anulada</span>;
  const state = item.clase
    ? CLASS_STATE[item.clase.estado]
    : item.estado === "VENCIDO"
      ? { label: "Venció sin usar", className: "bg-ink-100 text-ink-600" }
      : { label: "Sin usar", className: "bg-amber-50 text-amber-700" };
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", state.className)}>{state.label}</span>;
}

/**
 * Spec 019 R8: "Quedan X de Y" y la barra desglosada (asistio, falto,
 * reservadas, disponibles). Una clase suelta no tiene barra: dice para que clase es.
 */
export function ClassesBar({ item, legend = false }: { item: MemberPackageItem; legend?: boolean }) {
  if (item.claseSuelta) {
    return (
      <p className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-ink-700">Clase suelta</span>
        <span className="truncate text-ink-500">
          {item.clase ? `Para: ${formatClassDate(item.clase.fecha, item.clase.horaInicio)}` : `sin usar · vence ${formatDateKeyShort(item.vence)}`}
        </span>
      </p>
    );
  }

  const { asistio, falto, reservadas } = item.uso;
  const segments = [
    { key: "asistio", count: asistio, style: { backgroundColor: item.discipline.color } },
    { key: "falto", count: falto, className: "bg-rose-400" },
    {
      key: "reservadas",
      count: reservadas,
      className: "bg-ink-300",
      style: { backgroundImage: "repeating-linear-gradient(45deg, transparent 0 3px, rgba(255,255,255,.55) 3px 6px)" }
    }
  ] as const;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-ink-700">
          Quedan {item.clasesRestantes} de {item.clases}
        </span>
        <span className="text-ink-400">vence {formatDateKeyShort(item.vence)}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-px overflow-hidden rounded-full bg-ink-100" aria-hidden>
        {segments.map((segment) =>
          segment.count > 0 ? (
            <div
              key={segment.key}
              className={cn("h-full", "className" in segment ? segment.className : undefined)}
              style={{ width: `${(segment.count / item.clases) * 100}%`, ...("style" in segment ? segment.style : {}) }}
            />
          ) : null
        )}
      </div>
      {legend ? (
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-500">
          <span>{asistio} asistió</span>
          {falto ? <span className="text-rose-600">{falto} faltó</span> : null}
          {reservadas ? <span>{reservadas} reservada{reservadas === 1 ? "" : "s"}</span> : null}
          <span>{item.clasesRestantes} disponible{item.clasesRestantes === 1 ? "" : "s"}</span>
        </p>
      ) : null}
    </div>
  );
}

type MemberFormValues = {
  nombre: string;
  apellido: string;
  celular: string;
  email: string;
  fechaNacimiento: string;
  notas: string;
};

export function MemberFormModal({
  member,
  onClose,
  onSaved
}: {
  member?: StudioMemberItem;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const request = useStudioRequest();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors }
  } = useForm<MemberFormValues>({
    defaultValues: {
      nombre: member?.nombre ?? "",
      apellido: member?.apellido ?? "",
      celular: member?.celular ?? "",
      email: member?.email ?? "",
      fechaNacimiento: member?.fechaNacimiento ?? "",
      notas: member?.notas ?? ""
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      nombre: values.nombre.trim(),
      apellido: values.apellido.trim() || null,
      celular: values.celular,
      email: values.email.trim() || null,
      fechaNacimiento: values.fechaNacimiento || null,
      notas: values.notas.trim() || null
    };
    const saved = member
      ? await request(`/api/studio-members/${member.id}`, { method: "PUT", body: JSON.stringify(payload) }, "Cliente actualizado")
      : await request("/api/studio-members", { method: "POST", body: JSON.stringify(payload) }, "Cliente creado");
    if (saved) {
      onSaved?.();
      onClose();
    }
  });

  return (
    <Modal size="md"
      open
      onClose={() => (isSubmitting ? undefined : onClose())}
      title={member ? "Editar cliente" : "Nuevo cliente"}
      description="El celular identifica al cliente; con él podrá reservar desde tu página."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="member-nombre">
              Nombre
            </label>
            <input
              id="member-nombre"
              className={inputClass}
              {...register("nombre", { required: "Requerido", minLength: { value: 2, message: "Muy corto" } })}
            />
            {errors.nombre ? <p className="mt-1 text-xs font-medium text-rose-600">{errors.nombre.message}</p> : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="member-apellido">
              Apellido
            </label>
            <input id="member-apellido" className={inputClass} {...register("apellido")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="member-celular">
              Celular
            </label>
            <input
              id="member-celular"
              type="tel"
              inputMode="tel"
              className={inputClass}
              placeholder="300 000 0000"
              {...register("celular", {
                required: "Requerido",
                validate: (value) => value.replace(/\D/g, "").length >= 7 || "Celular inválido"
              })}
            />
            {errors.celular ? <p className="mt-1 text-xs font-medium text-rose-600">{errors.celular.message}</p> : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="member-nacimiento">
              Cumpleaños <span className="text-ink-400">(opcional)</span>
            </label>
            <input id="member-nacimiento" type="date" className={inputClass} {...register("fechaNacimiento")} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="member-email">
            Correo <span className="text-ink-400">(opcional)</span>
          </label>
          <input id="member-email" type="email" className={inputClass} {...register("email")} />
        </div>
        <div>
          <label className={labelClass} htmlFor="member-notas">
            Notas <span className="text-ink-400">(opcional)</span>
          </label>
          <textarea id="member-notas" className={`${inputClass} min-h-16 resize-none`} {...register("notas")} />
        </div>
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1 rounded-xl py-2.5 shadow-none" loading={isSubmitting}>
            {member ? "Guardar" : "Crear cliente"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Spec 027: venta, renovación y pago, paso a paso ─────────────────────────

type ChargeMode = "TOTAL" | "ABONO" | "NADA";

/** Cuánto se recibe ahora (todo, una parte o nada) y con qué métodos. */
function useCharge(due: number, initial: ChargeMode = "TOTAL") {
  const [mode, setMode] = useState<ChargeMode>(initial);
  const [abono, setAbono] = useState("");
  const amount = mode === "TOTAL" ? due : mode === "ABONO" ? Number(abono || 0) : 0;
  const [parts, setParts] = usePaymentParts(amount);
  const error =
    mode === "NADA"
      ? null
      : amount <= 0
        ? "Escribe cuánto recibes"
        : amount > due
          ? `No puede superar ${currency(due)}`
          : parts.length > 1
            ? paymentPartsError(amount, parts)
            : null;
  return { mode, setMode, abono, setAbono, amount, parts, setParts, error, debe: amount < due };
}

type Charge = ReturnType<typeof useCharge>;

/** Lo recibido, listo para el cuerpo de la API (nada si no pagó). */
function chargeBody(charge: Charge) {
  return charge.amount > 0 ? { pago: { monto: charge.amount, ...paymentPayload(charge.parts) } } : {};
}

function ChargeStep({
  charge,
  due,
  allowLater,
  deadline
}: {
  charge: Charge;
  due: number;
  /** Venta y renovación pueden quedar sin pago; un pago, no. */
  allowLater: boolean;
  deadline?: { value: string; min: string; onChange: (value: string) => void } | null;
}) {
  const modes: Array<[ChargeMode, string]> = [
    ["TOTAL", "Paga todo"],
    ["ABONO", "Abona una parte"],
    ...(allowLater ? ([["NADA", "Paga después"]] as Array<[ChargeMode, string]>) : [])
  ];

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="¿Cuánto paga ahora?" className={cn("grid gap-2", allowLater ? "grid-cols-3" : "grid-cols-2")}>
        {modes.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={charge.mode === value}
            onClick={() => charge.setMode(value)}
            className={cn(
              "min-h-11 rounded-xl border-2 px-2 py-2 text-xs font-bold transition-colors sm:text-sm",
              charge.mode === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {charge.mode === "ABONO" ? (
        <div>
          <label className={labelClass}>¿Cuánto abona?</label>
          <MoneyInput value={charge.abono} onChange={charge.setAbono} className="h-[42px] rounded-xl py-2.5 text-sm" aria-label="Monto del abono" />
          {charge.amount > 0 && charge.amount < due ? (
            <p className="mt-1 text-[11px] text-amber-600">Quedará debiendo {currency(due - charge.amount)}</p>
          ) : null}
        </div>
      ) : null}

      {charge.mode !== "NADA" ? (
        <PaymentBreakdown total={charge.amount} value={charge.parts} onChange={charge.setParts} />
      ) : (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Quedará debiendo {currency(due)}.</p>
      )}

      {deadline && charge.debe && due > 0 ? <BalanceDeadlineField value={deadline.value} min={deadline.min} onChange={deadline.onChange} /> : null}
    </div>
  );
}

function WizardFooter({
  step,
  last,
  saving,
  disabled,
  finishLabel,
  onBack,
  onNext,
  onFinish
}: {
  step: number;
  last: number;
  saving: boolean;
  disabled?: boolean;
  finishLabel: string;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="flex gap-3 border-t border-ink-100 pt-4">
      <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onBack} disabled={saving}>
        {step === 0 ? "Cancelar" : "Atrás"}
      </Button>
      <Button
        type="button"
        className="flex-1 rounded-xl py-2.5 shadow-none"
        loading={saving}
        disabled={disabled}
        onClick={step === last ? onFinish : onNext}
      >
        {step === last ? finishLabel : "Continuar"}
      </Button>
    </div>
  );
}

type CartLine = { packageId: string; inicio: string; precio: string };

/**
 * Spec 027 D1: vender uno o varios paquetes (de distintas disciplinas) en una
 * venta, en tres pasos: Paquetes → Detalles → Pago. Cada paquete queda como su
 * propio plan; lo recibido se reparte en el orden elegido (D4).
 */
export function SellPackageModal({
  memberLabel,
  memberId,
  today,
  disciplines,
  packages,
  diasPlazoSaldo = 7,
  onClose
}: {
  memberLabel: string;
  memberId: string;
  today: string;
  disciplines: DisciplineItem[];
  packages: PackageItem[];
  diasPlazoSaldo?: number;
  onClose: () => void;
}) {
  const request = useStudioRequest();
  const forSale = useMemo(() => packages.filter((item) => item.activo), [packages]);
  const sellable = disciplines.filter((discipline) => forSale.some((item) => item.disciplineId === discipline.id));
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [fechaLimite, setFechaLimite] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = lines
    .map((line) => ({ line, item: forSale.find((entry) => entry.id === line.packageId) }))
    .filter((entry): entry is { line: CartLine; item: PackageItem } => Boolean(entry.item));
  const total = picked.reduce((sum, entry) => sum + Number(entry.line.precio || 0), 0);
  const charge = useCharge(total);
  const firstStart = picked.reduce((min, entry) => (entry.line.inicio < min ? entry.line.inicio : min), picked[0]?.line.inicio ?? today);
  const disciplineName = (id: string) => disciplines.find((discipline) => discipline.id === id)?.nombre ?? "";

  function toggle(item: PackageItem) {
    setLines((current) =>
      current.some((line) => line.packageId === item.id)
        ? current.filter((line) => line.packageId !== item.id)
        : [...current, { packageId: item.id, inicio: today, precio: String(Math.round(Number(item.precio))) }]
    );
  }

  function update(packageId: string, patch: Partial<CartLine>) {
    setLines((current) => current.map((line) => (line.packageId === packageId ? { ...line, ...patch } : line)));
  }

  function next() {
    if (step === 0 && !picked.length) return setError("Elige al menos un paquete");
    if (step === 1 && picked.some((entry) => !entry.line.inicio)) return setError("Escribe la fecha de inicio de cada paquete");
    setError(null);
    setStep((current) => current + 1);
  }

  async function submit() {
    if (charge.error) return setError(charge.error);
    if (charge.debe && fechaLimite && fechaLimite < firstStart) return setError("La fecha para pagar el resto no puede ser antes del inicio");
    setError(null);
    setSaving(true);
    const saved = await request(
      "/api/member-packages",
      {
        method: "POST",
        body: JSON.stringify({
          memberId,
          items: picked.map((entry) => ({ packageId: entry.item.id, inicio: entry.line.inicio, precio: Number(entry.line.precio || 0) })),
          ...chargeBody(charge),
          // Spec 020 D2: sin tocarla, aplica el plazo de Ajustes.
          ...(charge.debe && fechaLimite ? { fechaLimitePago: fechaLimite } : {})
        })
      },
      picked.length > 1 ? `${picked.length} paquetes vendidos` : "Paquete vendido"
    );
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Modal open onClose={() => (saving ? undefined : onClose())} title="Vender paquetes" description={memberLabel}>
      {!sellable.length ? (
        <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 p-4 text-center text-sm text-ink-500">
          No hay paquetes disponibles para la venta. Créalos en Paquetes y precios.
        </p>
      ) : (
        <div className="space-y-4">
          <ModalSteps steps={["Paquetes", "Detalles", "Pago"]} current={step} onSelect={setStep} />

          {step === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-500">Elige uno o varios paquetes. Puedes combinar disciplinas.</p>
              {sellable.map((discipline) => (
                <section key={discipline.id}>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
                    <ColorDot color={discipline.color} className="size-2.5" />
                    {discipline.nombre}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {forSale
                      .filter((item) => item.disciplineId === discipline.id)
                      .map((item) => {
                        const selected = lines.some((line) => line.packageId === item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggle(item)}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                              selected ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300"
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                                selected ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300"
                              )}
                              aria-hidden
                            >
                              {selected ? <FiCheck className="size-3.5" /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-ink-800">{item.nombre}</span>
                              <span className="block text-xs text-ink-500">
                                {item.clases === 1 ? "Clase suelta" : `${item.clases} clases · ${item.vigenciaDias} días`}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-bold text-ink-900">{currency(item.precio)}</span>
                          </button>
                        );
                      })}
                  </div>
                </section>
              ))}
              {picked.length ? (
                <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
                  {picked.length === 1 ? "1 paquete" : `${picked.length} paquetes`} · {currency(total)}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              {picked.map(({ line, item }) => {
                const price = Number(line.precio || 0);
                return (
                  <div key={item.id} className="rounded-xl border border-ink-200 p-3">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-bold text-ink-900">
                        {item.nombre} <span className="font-medium text-ink-500">· {disciplineName(item.disciplineId)}</span>
                      </p>
                      {picked.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => toggle(item)}
                          aria-label={`Quitar ${item.nombre}`}
                          className="rounded-lg p-1 text-ink-400 hover:bg-ink-50 hover:text-rose-600"
                        >
                          <FiX className="size-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass} htmlFor={`sale-inicio-${item.id}`}>
                          Inicia
                        </label>
                        <input
                          id={`sale-inicio-${item.id}`}
                          type="date"
                          className={inputClass}
                          value={line.inicio}
                          onChange={(event) => update(item.id, { inicio: event.target.value })}
                        />
                        <p className="mt-1 text-[11px] text-ink-400">Vence {formatDateKeyShort(addDaysToKey(line.inicio || today, item.vigenciaDias - 1))}</p>
                      </div>
                      <div>
                        <label className={labelClass}>Precio final</label>
                        <MoneyInput
                          value={line.precio}
                          onChange={(value) => update(item.id, { precio: value })}
                          className="h-[42px] rounded-xl py-2.5 text-sm"
                          aria-label={`Precio final de ${item.nombre}`}
                        />
                        {price < Number(item.precio) ? (
                          <p className="mt-1 text-[11px] text-brand-600">Descuento de {currency(Number(item.precio) - price)}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <PaymentSummary
                rows={picked.map(({ line, item }) => ({
                  label: (
                    <>
                      {item.nombre} · {disciplineName(item.disciplineId)}
                      <span className="block text-[11px] text-ink-400">desde {formatDateKeyShort(line.inicio)}</span>
                    </>
                  ),
                  value: Number(line.precio || 0)
                }))}
                totalLabel="Total de la venta"
                total={total}
              />
              <ChargeStep
                charge={charge}
                due={total}
                allowLater
                deadline={{ value: fechaLimite || addDaysToKey(firstStart, diasPlazoSaldo), min: firstStart, onChange: setFechaLimite }}
              />
            </div>
          ) : null}

          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

          <WizardFooter
            step={step}
            last={2}
            saving={saving}
            disabled={step === 0 && !picked.length}
            finishLabel={charge.amount > 0 ? `Vender y cobrar ${currency(charge.amount)}` : `Vender ${currency(total)}`}
            onBack={() => (step === 0 ? onClose() : setStep(step - 1))}
            onNext={next}
            onFinish={submit}
          />
        </div>
      )}
    </Modal>
  );
}

/** Spec 020 D2: "Paga el resto antes del...". */
function BalanceDeadlineField({ value, min, onChange }: { value: string; min: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className={labelClass} htmlFor="sale-fecha-limite">
        Paga el resto antes del
      </label>
      <input
        id="sale-fecha-limite"
        type="date"
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </div>
  );
}

/**
 * Spec 020 D1/R3: renovar es vender el mismo paquete otra vez. Un plan vigente
 * sigue el dia despues de vencer; uno vencido o agotado empieza hoy (la misma
 * regla de renewalStart en el servidor). Spec 027: Detalles → Pago.
 */
export function RenewPackageModal({
  sale,
  memberLabel,
  today,
  packages,
  diasPlazoSaldo = 7,
  onClose
}: {
  sale: MemberPackageItem;
  memberLabel: string;
  today: string;
  packages: PackageItem[];
  diasPlazoSaldo?: number;
  onClose: () => void;
}) {
  const request = useStudioRequest();
  const item = packages.find((entry) => entry.id === sale.packageId && entry.activo);
  const [step, setStep] = useState(0);
  const [inicio, setInicio] = useState(sale.estado === "ACTIVO" && sale.vence >= today ? addDaysToKey(sale.vence, 1) : today);
  const [precio, setPrecio] = useState(item ? String(Math.round(Number(item.precio))) : "");
  const [fechaLimite, setFechaLimite] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = Number(precio || 0);
  const charge = useCharge(price, "NADA");

  async function submit() {
    if (charge.error) return setError(charge.error);
    if (charge.debe && fechaLimite && fechaLimite < inicio) return setError("La fecha para pagar el resto no puede ser antes del inicio");
    setError(null);
    setSaving(true);
    const saved = await request(
      `/api/member-packages/${sale.id}/renew`,
      {
        method: "POST",
        body: JSON.stringify({
          inicio,
          precio: price,
          ...chargeBody(charge),
          ...(charge.debe && fechaLimite ? { fechaLimitePago: fechaLimite } : {})
        })
      },
      "Plan renovado"
    );
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Modal
      size="md"
      open
      onClose={() => (saving ? undefined : onClose())}
      title="Renovar plan"
      description={`${memberLabel} · ${sale.nombre} ${sale.discipline.nombre} (${sale.clases} clases)`}
    >
      {!item ? (
        <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 p-4 text-center text-sm text-ink-500">
          Este paquete ya no se vende. Véndele otro desde Vender paquetes.
        </p>
      ) : (
        <div className="space-y-4">
          <ModalSteps steps={["Detalles", "Pago"]} current={step} onSelect={setStep} />

          {step === 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="renew-inicio">
                    Empieza
                  </label>
                  <input
                    id="renew-inicio"
                    type="date"
                    value={inicio}
                    onChange={(event) => setInicio(event.target.value || today)}
                    className={inputClass}
                  />
                  <p className="mt-1 text-[11px] text-ink-400">Vence {formatDateKeyShort(addDaysToKey(inicio, item.vigenciaDias - 1))}</p>
                </div>
                <div>
                  <label className={labelClass}>Precio</label>
                  <MoneyInput value={precio} onChange={setPrecio} className="h-[42px] rounded-xl py-2.5 text-sm" aria-label="Precio" />
                </div>
              </div>
              {sale.clasesRestantes > 0 ? (
                <p className="text-[11px] text-amber-700">
                  Le {sale.clasesRestantes === 1 ? "queda 1 clase" : `quedan ${sale.clasesRestantes} clases`} sin usar: no se pasan al plan nuevo.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <PaymentSummary
                rows={[{ label: `${sale.nombre} · ${sale.discipline.nombre}, desde ${formatDateKeyShort(inicio)}`, value: price }]}
                totalLabel="Total de la renovación"
                total={price}
              />
              <ChargeStep
                charge={charge}
                due={price}
                allowLater
                deadline={{ value: fechaLimite || addDaysToKey(inicio, diasPlazoSaldo), min: inicio, onChange: setFechaLimite }}
              />
            </>
          )}

          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

          <WizardFooter
            step={step}
            last={1}
            saving={saving}
            finishLabel={charge.amount > 0 ? `Renovar y cobrar ${currency(charge.amount)}` : `Renovar ${currency(price)}`}
            onBack={() => (step === 0 ? onClose() : setStep(0))}
            onNext={() => setStep(1)}
            onFinish={submit}
          />
        </div>
      )}
    </Modal>
  );
}

/**
 * Spec 027 D7: registrar el pago de un plan en dos pasos. Resumen (precio,
 * pagado, saldo; cuánto paga y cuándo) → Pago (método o dos partes).
 */
export function RegisterPaymentModal({ sale, today, onClose }: { sale: MemberPackageItem; today: string; onClose: () => void }) {
  const request = useStudioRequest();
  const [step, setStep] = useState(0);
  const [fecha, setFecha] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const charge = useCharge(sale.saldo);

  function next() {
    if (charge.mode === "ABONO" && (charge.amount <= 0 || charge.amount > sale.saldo)) {
      return setError(charge.amount > sale.saldo ? `No puede superar el saldo de ${currency(sale.saldo)}` : "Escribe cuánto abona");
    }
    setError(null);
    setStep(1);
  }

  async function submit() {
    if (charge.error) return setError(charge.error);
    setError(null);
    setSaving(true);
    const saved = await request(
      `/api/member-packages/${sale.id}/payments`,
      { method: "POST", body: JSON.stringify({ monto: charge.amount, fecha, ...paymentPayload(charge.parts) }) },
      charge.amount === sale.saldo ? "Plan pagado" : "Abono registrado"
    );
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Modal size="md" open onClose={() => (saving ? undefined : onClose())} title="Registrar pago" description={`${sale.nombre} · ${sale.discipline.nombre}`}>
      <div className="space-y-4">
        <ModalSteps steps={["Resumen", "Pago"]} current={step} onSelect={setStep} />

        {step === 0 ? (
          <>
            <PaymentSummary
              rows={[
                { label: "Precio del plan", value: sale.precio },
                ...(sale.pagado > 0 ? [{ label: "Ya pagado", value: sale.pagado, tone: "discount" as const }] : [])
              ]}
              totalLabel="Saldo pendiente"
              total={sale.saldo}
            />
            <div role="radiogroup" aria-label="¿Cuánto paga?" className="grid grid-cols-2 gap-2">
              {(
                [
                  ["TOTAL", "Paga todo el saldo"],
                  ["ABONO", "Abona una parte"]
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={charge.mode === value}
                  onClick={() => charge.setMode(value)}
                  className={cn(
                    "min-h-11 rounded-xl border-2 px-2 py-2 text-sm font-bold transition-colors",
                    charge.mode === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {charge.mode === "ABONO" ? (
                <div>
                  <label className={labelClass}>¿Cuánto abona?</label>
                  <MoneyInput value={charge.abono} onChange={charge.setAbono} className="h-[42px] rounded-xl py-2.5 text-sm" aria-label="Monto del abono" />
                </div>
              ) : null}
              <div className={charge.mode === "ABONO" ? "" : "col-span-2 sm:col-span-1"}>
                <label className={labelClass} htmlFor="payment-fecha">
                  Fecha del pago
                </label>
                <input id="payment-fecha" type="date" max={today} value={fecha} onChange={(event) => setFecha(event.target.value)} className={inputClass} />
              </div>
            </div>
            {charge.mode === "ABONO" && charge.amount > 0 && charge.amount < sale.saldo ? (
              <p className="text-[11px] text-amber-600">Quedará debiendo {currency(sale.saldo - charge.amount)}</p>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3">
              <span className="text-sm font-semibold text-brand-800">{charge.mode === "TOTAL" ? "Paga el saldo" : "Abono"}</span>
              <span className="text-2xl font-black tracking-tight text-brand-800 tabular-nums">{currency(charge.amount)}</span>
            </div>
            <p className="text-sm text-ink-500">Confirma cómo recibiste {currency(charge.amount)}.</p>
            <PaymentBreakdown total={charge.amount} value={charge.parts} onChange={charge.setParts} />
          </>
        )}

        {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

        <WizardFooter
          step={step}
          last={1}
          saving={saving}
          finishLabel={`Registrar ${charge.amount > 0 ? currency(charge.amount) : ""}`}
          onBack={() => (step === 0 ? onClose() : setStep(0))}
          onNext={next}
          onFinish={submit}
        />
      </div>
    </Modal>
  );
}
