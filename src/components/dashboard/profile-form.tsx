"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFieldArray, useForm } from "react-hook-form";
import { sileo } from "sileo";
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
    <form className="shell-card grid gap-5 p-5 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label className="mb-2 block text-sm font-semibold text-ink-700">Tu nombre</label>
        <input className="field-base" {...register("nombre")} />
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold text-ink-700">Negocio</label>
        <input className="field-base" {...register("businessName")} />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-2 block text-sm font-semibold text-ink-700">Teléfono</label>
        <input className="field-base" {...register("telefono")} />
      </div>
      <div className="sm:col-span-2 border-t border-ink-100 pt-5">
        <h2 className="text-lg font-black text-ink-950">Mensaje y metodos de pago</h2>
      </div>
      <div className="sm:col-span-2 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="block text-sm font-semibold text-ink-700">Metodos de pago</label>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10 rounded-[14px] px-3 py-2 text-xs"
            onClick={() => append({ name: "", account: "" })}
          >
            Agregar metodo de pago
          </Button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 rounded-[18px] border border-ink-100 bg-ink-50/60 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                className="field-base h-11 rounded-[16px]"
                placeholder="Nequi, Bancolombia, Daviplata"
                {...register(`paymentMethodItems.${index}.name` as const)}
              />
              <input
                className="field-base h-11 rounded-[16px]"
                placeholder="Numero o dato de la cuenta"
                {...register(`paymentMethodItems.${index}.account` as const)}
              />
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-[16px] px-3 text-rose-600 hover:bg-rose-50"
                onClick={() => remove(index)}
              >
                Eliminar
              </Button>
            </div>
          ))}
          {!fields.length ? (
            <div className="rounded-[18px] border border-dashed border-ink-200 bg-white px-4 py-4 text-sm font-semibold text-ink-500">
              Agrega al menos un metodo si quieres incluir cuentas en los mensajes de WhatsApp.
            </div>
          ) : null}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="mb-2 block text-sm font-semibold text-ink-700">Mensaje para WhatsApp</label>
        <textarea
          className="field-base min-h-40 resize-y"
          placeholder={OVERDUE_PAYMENT_MESSAGE_TEMPLATE}
          {...register("whatsappMessageTemplate")}
        />
        <p className="mt-2 text-xs font-semibold text-ink-500">
          Puedes cambiar el saludo y el cierre. El sistema ajusta mensualidades, inscripcion y total segun cada deuda.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {WHATSAPP_VARIABLES.map((variable) => (
            <span key={variable} className="rounded-full bg-ink-50 px-3 py-1 text-xs font-bold text-ink-600">
              {variable}
            </span>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>
          Guardar cambios
        </Button>
      </div>
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
