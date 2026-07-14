"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFieldArray, useForm } from "react-hook-form";
import { sileo } from "sileo";
import { FiPlus, FiSave, FiTrash2 } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { clientApiFetch } from "@/lib/client-api";
import { OVERDUE_PAYMENT_MESSAGE_TEMPLATE, OVERDUE_PAYMENT_MESSAGE_VARIABLES } from "@/lib/whatsapp-template";
import type { PaymentMethodItem, SafeClient } from "@/lib/web-types";

type ProfileFormValues = Pick<SafeClient, "nombre" | "telefono" | "businessName" | "whatsappMessageTemplate"> & {
  paymentMethodItems: PaymentMethodItem[];
};

const WHATSAPP_VARIABLES = OVERDUE_PAYMENT_MESSAGE_VARIABLES.map((variable) => `{{${variable}}}`);

export function ProfileForm({ profile }: { profile: SafeClient }) {
  const { data: session } = useSession();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting }
  } = useForm<ProfileFormValues>({
    defaultValues: {
      nombre: profile.nombre,
      telefono: profile.telefono ?? "",
      businessName: profile.businessName,
      paymentMethodItems: normalizePaymentMethodItems(profile.paymentMethodItems, profile.paymentMethods),
      whatsappMessageTemplate: profile.whatsappMessageTemplate ?? OVERDUE_PAYMENT_MESSAGE_TEMPLATE
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "paymentMethodItems" });

  async function onSubmit(values: ProfileFormValues) {
    const token = session?.user.apiToken;
    if (!token) return;
    const paymentMethodItems = values.paymentMethodItems
      .map((item) => ({ name: item.name.trim(), account: item.account.trim() }))
      .filter((item) => item.name || item.account);

    await clientApiFetch<SafeClient>("/api/client/profile", token, {
      method: "PUT",
      body: JSON.stringify({ ...values, paymentMethodItems })
    })
      .then((updatedProfile) => {
        reset({
          nombre: updatedProfile.nombre,
          telefono: updatedProfile.telefono ?? "",
          businessName: updatedProfile.businessName,
          paymentMethodItems: normalizePaymentMethodItems(updatedProfile.paymentMethodItems, updatedProfile.paymentMethods),
          whatsappMessageTemplate: updatedProfile.whatsappMessageTemplate ?? OVERDUE_PAYMENT_MESSAGE_TEMPLATE
        });
        sileo.success({ title: "Perfil actualizado" });
        router.refresh();
      })
      .catch((error: Error) => {
        sileo.error({ title: error.message });
      });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
      <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-black text-ink-950">Datos del negocio</h2>
          <p className="mt-1 text-sm text-ink-500">Información principal de la cuenta.</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold text-ink-700">Tu nombre</span>
            <input className="field-base h-11 rounded-xl text-sm" {...register("nombre")} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold text-ink-700">Negocio</span>
            <input className="field-base h-11 rounded-xl text-sm" {...register("businessName")} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-[13px] font-semibold text-ink-700">Teléfono</span>
            <input className="field-base h-11 rounded-xl text-sm" {...register("telefono")} />
          </label>
        </div>
      </section>

      <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-ink-950">Cobros y mensajes</h2>
            <p className="mt-1 text-sm text-ink-500">Cuentas y plantilla para notificaciones.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10 shrink-0 rounded-xl px-3 py-2 text-xs"
            onClick={() => append({ name: "", account: "" })}
          >
            <FiPlus className="size-4" />
            <span className="hidden min-[380px]:inline">Agregar método</span>
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          <p className="text-[13px] font-semibold text-ink-700">Métodos de pago</p>
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-[minmax(0,1fr)_44px] gap-2 rounded-2xl border border-ink-100 bg-ink-50/60 p-3 sm:grid-cols-[1fr_1fr_44px]"
            >
              <input
                className="field-base col-span-2 h-11 rounded-xl text-sm sm:col-span-1"
                placeholder="Nequi, Bancolombia, Daviplata"
                {...register(`paymentMethodItems.${index}.name` as const)}
              />
              <input
                className="field-base h-11 rounded-xl text-sm"
                placeholder="Número o cuenta"
                {...register(`paymentMethodItems.${index}.account` as const)}
              />
              <Button
                type="button"
                variant="ghost"
                className="size-11 rounded-xl p-0 text-rose-600 hover:bg-rose-50"
                onClick={() => remove(index)}
                aria-label="Eliminar método de pago"
                title="Eliminar método de pago"
              >
                <FiTrash2 className="size-4" />
              </Button>
            </div>
          ))}
          {!fields.length ? (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
              No hay métodos de pago configurados.
            </div>
          ) : null}
        </div>

        <div className="mt-5 border-t border-ink-100 pt-5">
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold text-ink-700">Mensaje para WhatsApp</span>
            <textarea
              className="field-base min-h-32 resize-y rounded-xl text-sm"
              placeholder={OVERDUE_PAYMENT_MESSAGE_TEMPLATE}
              {...register("whatsappMessageTemplate")}
            />
          </label>
          <p className="mt-3 text-xs font-semibold text-ink-500">Variables disponibles</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {WHATSAPP_VARIABLES.map((variable) => (
              <span key={variable} className="rounded-full bg-ink-50 px-3 py-1 text-xs font-bold text-ink-600">
                {variable}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end border-t border-ink-100 pt-5">
          <Button className="min-h-11 w-full rounded-xl px-5 text-sm sm:w-auto" type="submit" loading={isSubmitting}>
            <FiSave className="size-4" />
            Guardar cambios
          </Button>
        </div>
      </section>
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
