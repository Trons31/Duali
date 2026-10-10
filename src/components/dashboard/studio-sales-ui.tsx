"use client";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { PAYMENT_METHODS } from "@/components/ui/payment-method-modal";
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

export function PackageStatusBadge({ item }: { item: MemberPackageItem }) {
  if (item.claseSuelta) return <DropInStatusBadge item={item} />;
  const { label, className } =
    item.estado === "ANULADO"
      ? { label: "Anulado", className: "bg-ink-100 text-ink-500" }
      : item.estado === "VENCIDO"
        ? { label: "Vencido", className: "bg-rose-50 text-rose-700" }
        : item.estado === "AGOTADO"
          ? { label: "Sin clases", className: "bg-ink-100 text-ink-600" }
          : item.porVencer
            ? {
                label: item.diasParaVencer <= 0 ? "Vence hoy" : `Vence en ${item.diasParaVencer} d`,
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
  return <span className="text-[11px] font-semibold text-rose-600">Debe {currency(item.saldo)}</span>;
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

function PaymentMethodPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PAYMENT_METHODS.map((method) => (
        <button
          key={method.value}
          type="button"
          aria-pressed={value === method.value}
          onClick={() => onChange(method.value)}
          className={cn(
            "rounded-xl border px-3 py-2 text-sm font-medium transition-all",
            value === method.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
          )}
        >
          {method.label}
        </button>
      ))}
    </div>
  );
}

type SaleFormValues = {
  disciplineId: string;
  packageId: string;
  inicio: string;
  precio: string;
  pagarAhora: boolean;
  monto: string;
  metodoPago: string;
};

/** Spec 006 R7: disciplina → paquete → inicio → precio → pago, en un paso. */
export function SellPackageModal({
  memberLabel,
  memberId,
  today,
  disciplines,
  packages,
  onClose
}: {
  memberLabel: string;
  memberId: string;
  today: string;
  disciplines: DisciplineItem[];
  packages: PackageItem[];
  onClose: () => void;
}) {
  const request = useStudioRequest();
  const forSale = useMemo(() => packages.filter((item) => item.activo), [packages]);
  const sellable = disciplines.filter((discipline) => forSale.some((item) => item.disciplineId === discipline.id));
  const {
    control,
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { isSubmitting }
  } = useForm<SaleFormValues>({
    defaultValues: {
      disciplineId: sellable[0]?.id ?? "",
      packageId: "",
      inicio: today,
      precio: "",
      pagarAhora: true,
      monto: "",
      metodoPago: "EFECTIVO"
    }
  });
  const disciplineId = watch("disciplineId");
  const packageId = watch("packageId");
  const pagarAhora = watch("pagarAhora");
  const options = forSale.filter((item) => item.disciplineId === disciplineId);
  const selected = forSale.find((item) => item.id === packageId);
  const precio = Number(watch("precio") || 0);
  const monto = Number(watch("monto") || 0);
  const [error, setError] = useState<string | null>(null);

  function pickPackage(item: PackageItem) {
    const price = String(Math.round(Number(item.precio)));
    setValue("packageId", item.id);
    setValue("precio", price);
    setValue("monto", price);
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!selected) return setError("Elige un paquete");
    if (values.pagarAhora && (monto <= 0 || monto > precio)) return setError("El pago debe ser mayor a 0 y no superar el precio");
    setError(null);

    const saved = await request(
      "/api/member-packages",
      {
        method: "POST",
        body: JSON.stringify({
          memberId,
          packageId: selected.id,
          inicio: values.inicio,
          precio,
          ...(values.pagarAhora ? { pago: { monto, metodoPago: values.metodoPago } } : {})
        })
      },
      "Paquete vendido"
    );
    if (saved) onClose();
  });

  return (
    <Modal open onClose={() => (isSubmitting ? undefined : onClose())} title="Vender paquete" description={memberLabel}>
      {!sellable.length ? (
        <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 p-4 text-center text-sm text-ink-500">
          No hay paquetes disponibles para la venta. Créalos en Paquetes y precios.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <span className={labelClass}>Disciplina</span>
            <div className="flex flex-wrap gap-2">
              {sellable.map((discipline) => (
                <button
                  key={discipline.id}
                  type="button"
                  aria-pressed={disciplineId === discipline.id}
                  onClick={() => {
                    setValue("disciplineId", discipline.id);
                    setValue("packageId", "");
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                    disciplineId === discipline.id
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 text-ink-600 hover:border-ink-300"
                  )}
                >
                  <ColorDot color={discipline.color} className="size-2.5" />
                  {discipline.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={labelClass}>Paquete</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={packageId === item.id}
                  onClick={() => pickPackage(item)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                    packageId === item.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-800">{item.nombre}</span>
                    <span className="block text-xs text-ink-500">
                      {item.clases === 1 ? "Clase suelta" : `${item.clases} clases · ${item.vigenciaDias} días`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-ink-900">{currency(item.precio)}</span>
                </button>
              ))}
            </div>
          </div>

          {selected ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="sale-inicio">
                    Inicia
                  </label>
                  <input id="sale-inicio" type="date" className={inputClass} {...register("inicio", { required: true })} />
                  <p className="mt-1 text-[11px] text-ink-400">
                    Vence {formatDateKeyShort(addDaysToKey(watch("inicio") || today, selected.vigenciaDias - 1))}
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Precio final</label>
                  <Controller
                    control={control}
                    name="precio"
                    render={({ field }) => (
                      <MoneyInput
                        value={field.value}
                        onChange={(value) => {
                          field.onChange(value);
                          if (pagarAhora) setValue("monto", value);
                        }}
                        className="h-[42px] rounded-xl py-2.5 text-sm"
                        aria-label="Precio final"
                      />
                    )}
                  />
                  {precio < Number(selected.precio) ? (
                    <p className="mt-1 text-[11px] text-brand-600">Descuento de {currency(Number(selected.precio) - precio)}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
                  <input type="checkbox" className="size-4 accent-brand-600" {...register("pagarAhora")} />
                  Registrar pago ahora
                </label>
                {pagarAhora ? (
                  <>
                    <div>
                      <label className={labelClass}>Monto recibido</label>
                      <Controller
                        control={control}
                        name="monto"
                        render={({ field }) => (
                          <MoneyInput
                            value={field.value}
                            onChange={field.onChange}
                            className="h-[42px] rounded-xl py-2.5 text-sm"
                            aria-label="Monto recibido"
                          />
                        )}
                      />
                      {monto > 0 && monto < precio ? (
                        <p className="mt-1 text-[11px] text-amber-600">Quedará debiendo {currency(precio - monto)}</p>
                      ) : null}
                    </div>
                    <PaymentMethodPicker value={watch("metodoPago")} onChange={(value) => setValue("metodoPago", value)} />
                  </>
                ) : (
                  <p className="text-[11px] text-ink-500">Quedará debiendo {currency(precio)}.</p>
                )}
              </div>
            </>
          ) : null}

          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 rounded-xl py-2.5 shadow-none" loading={isSubmitting} disabled={!selected}>
              Vender {selected ? currency(precio) : ""}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function RegisterPaymentModal({ sale, today, onClose }: { sale: MemberPackageItem; today: string; onClose: () => void }) {
  const request = useStudioRequest();
  const [monto, setMonto] = useState(String(sale.saldo));
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [fecha, setFecha] = useState(today);
  const [saving, setSaving] = useState(false);
  const amount = Number(monto || 0);
  const invalid = amount <= 0 || amount > sale.saldo;

  async function submit() {
    setSaving(true);
    const saved = await request(
      `/api/member-packages/${sale.id}/payments`,
      { method: "POST", body: JSON.stringify({ monto: amount, metodoPago, fecha }) },
      amount === sale.saldo ? "Paquete pagado" : "Abono registrado"
    );
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Modal size="md"
      open
      onClose={() => (saving ? undefined : onClose())}
      title="Registrar pago"
      description={`${sale.nombre} ${sale.discipline.nombre} · saldo ${currency(sale.saldo)}`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Monto</label>
            <MoneyInput value={monto} onChange={setMonto} className="h-[42px] rounded-xl py-2.5 text-sm" aria-label="Monto" />
            {amount > sale.saldo ? <p className="mt-1 text-[11px] text-rose-600">Supera el saldo</p> : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="payment-fecha">
              Fecha
            </label>
            <input
              id="payment-fecha"
              type="date"
              max={today}
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <PaymentMethodPicker value={metodoPago} onChange={setMetodoPago} />
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" className="flex-1 rounded-xl py-2.5 shadow-none" loading={saving} disabled={invalid} onClick={submit}>
            Registrar {amount > 0 ? currency(amount) : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
