"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFieldArray, useForm } from "react-hook-form";
import { sileo } from "sileo";
import { FiCalendar, FiCreditCard, FiGlobe, FiMessageSquare, FiPlus, FiSave, FiTrash2 } from "react-icons/fi";
import { LuLoader, LuShapes, LuStore } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { clientApiFetch } from "@/lib/client-api";
import { OVERDUE_PAYMENT_MESSAGE_TEMPLATE, OVERDUE_PAYMENT_MESSAGE_VARIABLES } from "@/lib/whatsapp-template";
import type { PaymentMethodItem, SafeClient } from "@/lib/web-types";
import { cn } from "@/lib/web-utils";

const WHATSAPP_VARIABLES = OVERDUE_PAYMENT_MESSAGE_VARIABLES.map((variable) => `{{${variable}}}`);

const inputClass =
  "w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-700 placeholder:text-ink-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400";
const labelClass = "mb-1 block text-xs font-medium text-ink-500";

/**
 * Ajustes al estilo de CliqCut (spec 001): cada tarjeta es un formulario propio
 * con su boton de guardar. Asi guardar una no envia ni descarta lo que se este
 * editando en otra, cosa que pasaba con el formulario unico de antes.
 */
export function SettingsSections({ profile }: { profile: SafeClient }) {
  return (
    <>
      <BusinessTypeSection profile={profile} />
      <InfoSection profile={profile} />
      {profile.moduloEstudio ? <BookingPolicySection profile={profile} /> : null}
      {profile.moduloEstudio ? <OnlinePaymentsSection profile={profile} /> : null}
      <PaymentMethodsSection profile={profile} />
      <MessageSection profile={profile} />
    </>
  );
}

function useSaveProfile() {
  const { data: session } = useSession();
  const router = useRouter();

  return async (body: Partial<SafeClient>, successTitle: string) => {
    const token = session?.user.apiToken;
    if (!token) return null;

    try {
      const updated = await clientApiFetch<SafeClient>("/api/client/profile", token, {
        method: "PUT",
        body: JSON.stringify(body)
      });
      sileo.success({ title: successTitle });
      router.refresh();
      return updated;
    } catch (error) {
      sileo.error({ title: (error as Error).message });
      return null;
    }
  };
}

function SectionCard({
  icon,
  title,
  description,
  action,
  children
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:space-y-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-4 shrink-0 text-brand-500 [&>svg]:size-4">{icon}</span>
          <div className="min-w-0">
            <h2 className="font-semibold text-ink-800">{title}</h2>
            <p className="mt-0.5 text-xs text-ink-400">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SaveButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <div className="flex justify-end pt-1">
      <Button
        type="submit"
        loading={loading}
        className="w-full rounded-xl px-4 py-2 font-medium shadow-none sm:w-auto sm:px-5"
      >
        {loading ? null : <FiSave className="size-4" />}
        {label}
      </Button>
    </div>
  );
}

type BusinessType = "ACADEMIA" | "ESTUDIO" | "AMBOS";

const BUSINESS_TYPES: Array<{ value: BusinessType; title: string; description: string }> = [
  {
    value: "ACADEMIA",
    title: "Academia",
    description: "Grupos fijos con mensualidad, inscripciones y útiles."
  },
  {
    value: "ESTUDIO",
    title: "Estudio",
    description: "Disciplinas, paquetes de clases y reservas de cupos."
  },
  {
    value: "AMBOS",
    title: "Academia + Estudio",
    description: "Usa los dos modelos a la vez en el mismo negocio."
  }
];

function toBusinessType(profile: Pick<SafeClient, "moduloAcademia" | "moduloEstudio">): BusinessType {
  if (profile.moduloAcademia && profile.moduloEstudio) return "AMBOS";
  return profile.moduloEstudio ? "ESTUDIO" : "ACADEMIA";
}

/** Spec 002 R3: igual que "Gestión de servicios" en CliqCut, guarda al hacer clic. */
function BusinessTypeSection({ profile }: { profile: SafeClient }) {
  const save = useSaveProfile();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<BusinessType>(toBusinessType(profile));

  function handleChange(next: BusinessType) {
    if (next === type || isPending) return;
    const previous = type;
    setType(next);
    startTransition(async () => {
      const updated = await save(
        { moduloAcademia: next !== "ESTUDIO", moduloEstudio: next !== "ACADEMIA" },
        "Tipo de negocio guardado"
      );
      if (!updated) setType(previous);
    });
  }

  return (
    <SectionCard icon={<LuShapes />} title="Tipo de negocio" description="Define qué módulos ves en el menú">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {BUSINESS_TYPES.map((option) => (
          <ModeOption
            key={option.value}
            selected={type === option.value}
            disabled={isPending}
            onClick={() => handleChange(option.value)}
            title={option.title}
            description={option.description}
          />
        ))}
      </div>
      {isPending ? (
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <LuLoader className="size-3 animate-spin" /> Guardando...
        </div>
      ) : null}
    </SectionCard>
  );
}

function ModeOption({
  selected,
  onClick,
  disabled,
  title,
  description
}: {
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`relative rounded-xl border-2 p-4 text-left transition-all disabled:opacity-60 ${
        selected ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white hover:border-ink-300"
      }`}
    >
      {selected ? (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-brand-500">
          <svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      ) : null}
      <p className="pr-6 text-sm font-semibold text-ink-800">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{description}</p>
    </button>
  );
}

type InfoValues = Pick<SafeClient, "businessName" | "nombre" | "telefono">;

function InfoSection({ profile }: { profile: SafeClient }) {
  const save = useSaveProfile();
  const toValues = (client: SafeClient): InfoValues => ({
    businessName: client.businessName,
    nombre: client.nombre,
    telefono: client.telefono ?? ""
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<InfoValues>({ defaultValues: toValues(profile) });

  async function onSubmit(values: InfoValues) {
    const updated = await save(values, "Información guardada");
    if (updated) reset(toValues(updated));
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SectionCard icon={<LuStore />} title="Información" description="Datos principales de tu academia">
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className={labelClass} htmlFor="businessName">
              Nombre de la academia
            </label>
            <input id="businessName" className={inputClass} placeholder="Ej: Academia Duali" {...register("businessName")} />
          </div>
          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="nombre">
                Tu nombre
              </label>
              <input id="nombre" className={inputClass} {...register("nombre")} />
            </div>
            <div>
              <label className={labelClass} htmlFor="telefono">
                Teléfono
              </label>
              <input id="telefono" className={inputClass} placeholder="+57 300 000 0000" {...register("telefono")} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="email">
              Correo
            </label>
            <input
              id="email"
              className={`${inputClass} cursor-not-allowed bg-ink-50 text-ink-500`}
              value={profile.email}
              readOnly
              title="El correo es el usuario de acceso y no se puede cambiar aquí"
            />
          </div>
        </div>
        <SaveButton loading={isSubmitting} label="Guardar información" />
      </SectionCard>
    </form>
  );
}

type BookingPolicyValues = { horasCancelacion: string; inasistencia: "pierde" | "devuelve"; diasPlazoSaldo: string };

/** Spec 007 R7: plazo para cancelar y recuperar la clase. Spec 019 R11: que pasa si no asiste. */
function BookingPolicySection({ profile }: { profile: SafeClient }) {
  const save = useSaveProfile();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<BookingPolicyValues>({
    defaultValues: {
      horasCancelacion: String(profile.horasCancelacion ?? 2),
      inasistencia: profile.devolverClaseInasistencia ? "devuelve" : "pierde",
      diasPlazoSaldo: String(profile.diasPlazoSaldo ?? 7)
    }
  });
  const horas = Number(watch("horasCancelacion") || 0);
  const plazo = Number(watch("diasPlazoSaldo") || 0);
  const inasistencia = watch("inasistencia");

  async function onSubmit(values: BookingPolicyValues) {
    const updated = await save(
      {
        horasCancelacion: Number(values.horasCancelacion),
        devolverClaseInasistencia: values.inasistencia === "devuelve",
        diasPlazoSaldo: Number(values.diasPlazoSaldo)
      },
      "Política de reservas guardada"
    );
    if (updated) {
      reset({
        horasCancelacion: String(updated.horasCancelacion),
        inasistencia: updated.devolverClaseInasistencia ? "devuelve" : "pierde",
        diasPlazoSaldo: String(updated.diasPlazoSaldo)
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SectionCard icon={<FiCalendar />} title="Reservas" description="Cuándo se devuelve la clase si cancelan o no asisten, y el plazo para pagar el saldo">
        <div className="max-w-xs">
          <label className={labelClass} htmlFor="horasCancelacion">
            Horas de anticipación para cancelar
          </label>
          <input
            id="horasCancelacion"
            type="number"
            inputMode="numeric"
            min={0}
            max={168}
            className={inputClass}
            {...register("horasCancelacion", {
              required: "Requerido",
              min: { value: 0, message: "Mínimo 0" },
              max: { value: 168, message: "Máximo 168 (7 días)" }
            })}
          />
          {errors.horasCancelacion ? (
            <p className="mt-1 text-xs font-medium text-rose-600">{errors.horasCancelacion.message}</p>
          ) : null}
        </div>
        <p className="rounded-xl border border-ink-200 bg-ink-50/60 p-3 text-xs leading-relaxed text-ink-600">
          {horas === 0
            ? "Si cancelan antes de que empiece la clase, recuperan la clase."
            : `Si cancelan con al menos ${horas} hora${horas === 1 ? "" : "s"} de anticipación, recuperan la clase. Después de eso la clase se pierde.`}
        </p>
        <fieldset>
          <legend className={labelClass}>Si reserva y no asiste</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["pierde", "Pierde la clase", "La clase reservada se descuenta igual. Es lo más común: ocupó un cupo."],
                ["devuelve", "Se le devuelve la clase", "Al marcar “No asistió”, la clase vuelve a su plan."]
              ] as const
            ).map(([value, title, help]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border-2 p-3 transition",
                  inasistencia === value ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300"
                )}
              >
                <input type="radio" value={value} className="mt-0.5 size-4 accent-brand-600" {...register("inasistencia")} />
                <span>
                  <span className="block text-sm font-semibold text-ink-800">{title}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {/* Spec 020 R11 */}
        <div className="max-w-xs">
          <label className={labelClass} htmlFor="diasPlazoSaldo">
            Plazo para pagar el saldo (días)
          </label>
          <input
            id="diasPlazoSaldo"
            type="number"
            inputMode="numeric"
            min={0}
            max={90}
            className={inputClass}
            {...register("diasPlazoSaldo", {
              required: "Requerido",
              min: { value: 0, message: "Mínimo 0" },
              max: { value: 90, message: "Máximo 90 días" }
            })}
          />
          {errors.diasPlazoSaldo ? <p className="mt-1 text-xs font-medium text-rose-600">{errors.diasPlazoSaldo.message}</p> : null}
        </div>
        <p className="rounded-xl border border-ink-200 bg-ink-50/60 p-3 text-xs leading-relaxed text-ink-600">
          {plazo === 0
            ? "Quien queda debiendo debe pagar el mismo día que empieza su plan."
            : `Quien queda debiendo tiene ${plazo} día${plazo === 1 ? "" : "s"} desde que empieza su plan. Después, el saldo sale como vencido. Al vender puedes cambiar la fecha.`}
        </p>
        <SaveButton loading={isSubmitting} label="Guardar política" />
      </SectionCard>
    </form>
  );
}

type OnlinePaymentValues = { permitirPagoEnEstudio: boolean; exigirPagoValidado: boolean };

/** Spec 021 R14: como se paga lo que se compra desde la pagina publica. */
function OnlinePaymentsSection({ profile }: { profile: SafeClient }) {
  const save = useSaveProfile();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<OnlinePaymentValues>({
    defaultValues: { permitirPagoEnEstudio: profile.permitirPagoEnEstudio, exigirPagoValidado: profile.exigirPagoValidado }
  });
  const values = watch();

  async function onSubmit(next: OnlinePaymentValues) {
    const updated = await save(next, "Pagos en línea guardados");
    if (updated) reset({ permitirPagoEnEstudio: updated.permitirPagoEnEstudio, exigirPagoValidado: updated.exigirPagoValidado });
  }

  const options = [
    {
      name: "permitirPagoEnEstudio",
      title: "Permitir pagar en el estudio",
      on: "En tu página aparece “Pagar en el estudio”: la compra queda debiendo y la cobras cuando llegue.",
      off: "Para comprar en tu página hay que subir el comprobante de la transferencia."
    },
    {
      name: "exigirPagoValidado",
      title: "Esperar a validar el pago para reservar",
      on: "Un plan comprado en línea solo reserva cuando apruebes su comprobante.",
      off: "Puede reservar de una vez mientras revisas el comprobante; así no pierde el cupo."
    }
  ] as const;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SectionCard icon={<FiGlobe />} title="Pagos en línea" description="Cómo pagan los planes que se compran en tu página">
        <div className="space-y-2">
          {options.map((option) => (
            <label key={option.name} className="flex cursor-pointer gap-3 rounded-xl border border-ink-200 p-3 hover:border-ink-300">
              <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" {...register(option.name)} />
              <span>
                <span className="block text-sm font-semibold text-ink-800">{option.title}</span>
                <span className="mt-0.5 block text-xs text-ink-500">{values[option.name] ? option.on : option.off}</span>
              </span>
            </label>
          ))}
        </div>
        <SaveButton loading={isSubmitting} label="Guardar pagos en línea" />
      </SectionCard>
    </form>
  );
}

type PaymentValues = { paymentMethodItems: PaymentMethodItem[] };

function PaymentMethodsSection({ profile }: { profile: SafeClient }) {
  const save = useSaveProfile();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting }
  } = useForm<PaymentValues>({
    defaultValues: {
      paymentMethodItems: normalizePaymentMethodItems(profile.paymentMethodItems, profile.paymentMethods)
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "paymentMethodItems" });

  async function onSubmit(values: PaymentValues) {
    const paymentMethodItems = values.paymentMethodItems
      .map((item) => ({ name: item.name.trim(), account: item.account.trim() }))
      .filter((item) => item.name || item.account);

    const updated = await save({ paymentMethodItems }, "Métodos de pago guardados");
    if (updated) {
      reset({
        paymentMethodItems: normalizePaymentMethodItems(updated.paymentMethodItems, updated.paymentMethods)
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SectionCard
        icon={<FiCreditCard />}
        title="Métodos de pago"
        description="Las cuentas que tus estudiantes ven al recibir un cobro"
        action={
          <button
            type="button"
            onClick={() => append({ name: "", account: "" })}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2 text-xs font-medium text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            <FiPlus className="size-3.5" />
            <span className="hidden min-[380px]:inline">Agregar</span>
          </button>
        }
      >
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink-800">Método {index + 1}</p>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="flex size-8 items-center justify-center rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100"
                  aria-label="Eliminar método de pago"
                  title="Eliminar método de pago"
                >
                  <FiTrash2 className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Proveedor</label>
                  <input
                    className={inputClass}
                    placeholder="Nequi, Bancolombia, Daviplata"
                    {...register(`paymentMethodItems.${index}.name` as const)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Número o cuenta</label>
                  <input
                    className={inputClass}
                    placeholder="3001234567 o cuenta bancaria"
                    {...register(`paymentMethodItems.${index}.account` as const)}
                  />
                </div>
              </div>
            </div>
          ))}
          {!fields.length ? (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
              No hay métodos de pago configurados.
            </div>
          ) : null}
        </div>
        <SaveButton loading={isSubmitting} label="Guardar métodos de pago" />
      </SectionCard>
    </form>
  );
}

type MessageValues = { whatsappMessageTemplate: string };

function MessageSection({ profile }: { profile: SafeClient }) {
  const save = useSaveProfile();
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<MessageValues>({
    defaultValues: { whatsappMessageTemplate: profile.whatsappMessageTemplate ?? OVERDUE_PAYMENT_MESSAGE_TEMPLATE }
  });

  async function onSubmit(values: MessageValues) {
    const updated = await save(values, "Mensaje de cobro guardado");
    if (updated) {
      reset({ whatsappMessageTemplate: updated.whatsappMessageTemplate ?? OVERDUE_PAYMENT_MESSAGE_TEMPLATE });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SectionCard
        icon={<FiMessageSquare />}
        title="Mensaje de cobro"
        description="La plantilla que se envía por WhatsApp al recordar un pago"
      >
        <div>
          <label className={labelClass} htmlFor="whatsappMessageTemplate">
            Plantilla
          </label>
          <textarea
            id="whatsappMessageTemplate"
            className={`${inputClass} min-h-32 resize-y`}
            placeholder={OVERDUE_PAYMENT_MESSAGE_TEMPLATE}
            {...register("whatsappMessageTemplate")}
          />
        </div>

        <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
          <p className="text-xs font-semibold text-ink-600">Variables disponibles</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Se reemplazan por los datos reales de cada estudiante al enviar el mensaje.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {WHATSAPP_VARIABLES.map((variable) => (
              <span
                key={variable}
                className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700"
              >
                {variable}
              </span>
            ))}
          </div>
        </div>
        <SaveButton loading={isSubmitting} label="Guardar mensaje" />
      </SectionCard>
    </form>
  );
}

function normalizePaymentMethodItems(items: SafeClient["paymentMethodItems"], legacyText: string | null) {
  if (Array.isArray(items)) {
    const normalized = items
      .map((item) => ({ name: String(item?.name ?? ""), account: String(item?.account ?? "") }))
      .filter((item) => item.name || item.account);
    if (normalized.length) return normalized;
  }

  if (legacyText?.trim()) {
    return [{ name: "Metodos de pago", account: legacyText.trim() }];
  }

  return [{ name: "", account: "" }];
}
