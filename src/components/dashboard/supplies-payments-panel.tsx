"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Controller, useForm } from "react-hook-form";
import { sileo } from "sileo";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { clientApiFetch } from "@/lib/client-api";
import { currency, formatDate } from "@/lib/web-utils";
import { parseMoney } from "@/lib/money-input";
import type { GroupSummary, StudentListItem, SuppliesPaymentItem } from "@/lib/web-types";

type SuppliesFormValues = {
  nombreConcepto: string;
  descripcion?: string;
  monto: string;
  grupoId?: string;
  estudianteId?: string;
  fechaVencimiento: string;
};

export function SuppliesPaymentsPanel({
  payments,
  groups,
  students
}: {
  payments: SuppliesPaymentItem[];
  groups: GroupSummary[];
  students: StudentListItem[];
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [payTarget, setPayTarget] = useState<SuppliesPaymentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SuppliesPaymentItem | null>(null);
  const token = session?.user.apiToken ?? "";
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { isSubmitting }
  } = useForm<SuppliesFormValues>({
    defaultValues: {
      nombreConcepto: "",
      descripcion: "",
      monto: "",
      grupoId: "",
      estudianteId: "",
      fechaVencimiento: new Date().toISOString().slice(0, 10)
    }
  });

  async function onSubmit(values: SuppliesFormValues) {
    const payload = {
      ...values,
      monto: parseMoney(values.monto),
      grupoId: values.grupoId || null,
      estudianteId: values.estudianteId || null
    };

    await clientApiFetch("/api/supplies-payments", token, {
      method: "POST",
      body: JSON.stringify(payload)
    })
      .then(() => {
        sileo.success({ title: "Cobro de útiles creado" });
        reset();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  async function payCurrent() {
    if (!payTarget) return;
    await clientApiFetch(`/api/supplies-payments/${payTarget.id}/pay`, token, {
      method: "PUT",
      body: JSON.stringify({})
    })
      .then(() => {
        sileo.success({ title: "Cobro marcado como pagado" });
        setPayTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  async function deleteCurrent() {
    if (!deleteTarget) return;
    await clientApiFetch(`/api/supplies-payments/${deleteTarget.id}`, token, { method: "DELETE" })
      .then(() => {
        sileo.success({ title: "Cobro eliminado" });
        setDeleteTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  return (
    <div className="space-y-6">
      <form className="shell-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink-700">Concepto</label>
          <input className="field-base" {...register("nombreConcepto", { required: true })} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink-700">Monto</label>
          <Controller
            control={control}
            name="monto"
            render={({ field }) => (
              <MoneyInput
                name={field.name}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink-700">Fecha de vencimiento</label>
          <input type="date" className="field-base" {...register("fechaVencimiento")} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink-700">Grupo opcional</label>
          <select className="field-base" {...register("grupoId")}>
            <option value="">Sin grupo</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink-700">Estudiante opcional</label>
          <select className="field-base" {...register("estudianteId")}>
            <option value="">Sin estudiante</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.nombre} {student.apellido}
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-3">
          <label className="mb-2 block text-sm font-semibold text-ink-700">Descripción</label>
          <textarea className="field-base min-h-24" {...register("descripcion")} />
        </div>
        <div className="lg:col-span-3">
          <Button type="submit" loading={isSubmitting}>
            Crear cobro de útiles
          </Button>
        </div>
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        {payments.map((payment) => (
          <article key={payment.id} className="shell-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-black text-ink-950">{payment.nombreConcepto}</h3>
                  <StatusBadge value={payment.estado} />
                </div>
                <p className="mt-2 text-sm text-ink-500">
                  {payment.student ? `${payment.student.nombre} ${payment.student.apellido}` : payment.group?.nombre ?? "General"}
                </p>
                <p className="mt-1 text-sm text-ink-500">Vence {formatDate(payment.fechaVencimiento)}</p>
              </div>
              <p className="text-xl font-black text-brand-700">{currency(payment.monto)}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {payment.estado !== "PAGADO" ? (
                <Button type="button" onClick={() => setPayTarget(payment)}>
                  Marcar pago
                </Button>
              ) : null}
              <Button type="button" variant="danger" onClick={() => setDeleteTarget(payment)}>
                Eliminar
              </Button>
            </div>
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(payTarget)}
        title="Registrar pago de útiles"
        description={`Confirmarás el pago de "${payTarget?.nombreConcepto}".`}
        variant="primary"
        notice="Confirma este pago solo si ese cobro adicional ya fue pagado y debe registrarse en caja."
        noticeTone="success"
        confirmText="Confirmar pago"
        onClose={() => setPayTarget(null)}
        onConfirm={payCurrent}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar cobro de útiles"
        description={`Eliminarás el cobro "${deleteTarget?.nombreConcepto}".`}
        notice="Elimina este cobro adicional solo si fue creado por error o ya no debe existir."
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteCurrent}
      />
    </div>
  );
}
