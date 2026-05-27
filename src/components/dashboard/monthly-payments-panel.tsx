"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PAYMENT_METHODS, PaymentMethodModal, type PaymentMethodValue } from "@/components/ui/payment-method-modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { clientApiFetch } from "@/lib/client-api";
import { currency, formatDate } from "@/lib/web-utils";
import type { GroupSummary, MonthlyPaymentItem, StudentListItem } from "@/lib/web-types";

type ManualPaymentForm = {
  estudianteId: string;
  mes: number;
  anio: number;
  monto: number;
  fechaVencimiento: string;
};

type GenerateByGroupForm = {
  groupId: string;
  mes: number;
  anio: number;
  fechaVencimiento: string;
  monto?: number;
};

export function MonthlyPaymentsPanel({
  payments,
  students,
  groups
}: {
  payments: MonthlyPaymentItem[];
  students: StudentListItem[];
  groups: GroupSummary[];
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [payTarget, setPayTarget] = useState<MonthlyPaymentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MonthlyPaymentItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>(PAYMENT_METHODS[0].value);
  const [paymentDate, setPaymentDate] = useState(defaultDateValue());
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const token = session?.user.apiToken ?? "";

  const manualForm = useForm<ManualPaymentForm>({
    defaultValues: {
      estudianteId: students[0]?.id ?? "",
      mes: new Date().getMonth() + 1,
      anio: new Date().getFullYear(),
      monto: Number(students[0]?.precioMensualidad ?? groups[0]?.precioMensualidadDefault ?? 0),
      fechaVencimiento: new Date().toISOString().slice(0, 10)
    }
  });

  const generateForm = useForm<GenerateByGroupForm>({
    defaultValues: {
      groupId: groups[0]?.id ?? "",
      mes: new Date().getMonth() + 1,
      anio: new Date().getFullYear(),
      fechaVencimiento: new Date().toISOString().slice(0, 10),
      monto: undefined
    }
  });

  async function createManual(values: ManualPaymentForm) {
    await clientApiFetch("/api/monthly-payments", token, {
      method: "POST",
      body: JSON.stringify(values)
    })
      .then(() => {
        sileo.success({ title: "Mensualidad creada" });
        manualForm.reset();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  async function createByGroup(values: GenerateByGroupForm) {
    await clientApiFetch<{ created: number }>("/api/monthly-payments/generate-group", token, {
      method: "POST",
      body: JSON.stringify(values)
    })
      .then((payload: { created: number }) => {
        sileo.success({ title: `${payload.created} mensualidades generadas` });
        generateForm.reset();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  async function payPayment() {
    if (!payTarget) return;
    setSubmittingPayment(true);
    await clientApiFetch(`/api/monthly-payments/${payTarget.id}/pay`, token, {
      method: "PUT",
      body: JSON.stringify({ metodoPago: paymentMethod, fechaPago: paymentDate })
    })
      .then(() => {
        sileo.success({ title: "Mensualidad marcada como pagada" });
        closePayModal();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }))
      .finally(() => setSubmittingPayment(false));
  }

  function openPayModal(payment: MonthlyPaymentItem) {
    setPaymentMethod(PAYMENT_METHODS[0].value);
    setPaymentDate(defaultDateValue());
    setPayTarget(payment);
  }

  function closePayModal() {
    setPayTarget(null);
    setPaymentMethod(PAYMENT_METHODS[0].value);
    setPaymentDate(defaultDateValue());
  }

  async function deletePayment() {
    if (!deleteTarget) return;
    await clientApiFetch(`/api/monthly-payments/${deleteTarget.id}`, token, { method: "DELETE" })
      .then(() => {
        sileo.success({ title: "Mensualidad eliminada" });
        setDeleteTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <form className="shell-card grid gap-4 p-5 sm:grid-cols-2" onSubmit={manualForm.handleSubmit(createManual)}>
          <h3 className="sm:col-span-2 text-lg font-black text-ink-950">Crear mensualidad manual</h3>
          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-ink-700">Estudiante</label>
            <select className="field-base" {...manualForm.register("estudianteId")}>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.nombre} {student.apellido}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Mes</label>
            <input type="number" min={1} max={12} className="field-base" {...manualForm.register("mes", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Año</label>
            <input type="number" className="field-base" {...manualForm.register("anio", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Monto</label>
            <input type="number" className="field-base" {...manualForm.register("monto", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Fecha de vencimiento</label>
            <input type="date" className="field-base" {...manualForm.register("fechaVencimiento")} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={manualForm.formState.isSubmitting}>
              Guardar mensualidad
            </Button>
          </div>
        </form>

        <form className="shell-card grid gap-4 p-5 sm:grid-cols-2" onSubmit={generateForm.handleSubmit(createByGroup)}>
          <h3 className="sm:col-span-2 text-lg font-black text-ink-950">Generar por grupo</h3>
          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-ink-700">Grupo</label>
            <select className="field-base" {...generateForm.register("groupId")}>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Mes</label>
            <input type="number" min={1} max={12} className="field-base" {...generateForm.register("mes", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Año</label>
            <input type="number" className="field-base" {...generateForm.register("anio", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Monto opcional</label>
            <input type="number" className="field-base" {...generateForm.register("monto", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink-700">Fecha de vencimiento</label>
            <input type="date" className="field-base" {...generateForm.register("fechaVencimiento")} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" loading={generateForm.formState.isSubmitting}>
              Generar masivo
            </Button>
          </div>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {payments.map((payment) => (
          <article key={payment.id} className="shell-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-black text-ink-950">
                    {payment.student.nombre} {payment.student.apellido}
                  </h3>
                  <StatusBadge value={payment.estado} />
                </div>
                <p className="mt-2 text-sm text-ink-500">
                  {payment.group.nombre} • {payment.mes}/{payment.anio}
                </p>
                <p className="mt-1 text-sm text-ink-500">Vence {formatDate(payment.fechaVencimiento)}</p>
              </div>
              <p className="text-xl font-black text-brand-700">{currency(payment.monto)}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {payment.estado !== "PAGADO" ? (
                <Button type="button" onClick={() => openPayModal(payment)}>
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

      <PaymentMethodModal
        open={Boolean(payTarget)}
        title="Registrar pago"
        description={`Marcarás como pagada la mensualidad de ${payTarget?.student.nombre} ${payTarget?.student.apellido}.`}
        amount={payTarget?.monto ?? null}
        notice="Marca esta mensualidad como pagada solo si el estudiante ya realizo el pago pendiente."
        paymentDate={paymentDate}
        selectedMethod={paymentMethod}
        confirmText="Confirmar pago"
        loading={submittingPayment}
        onClose={closePayModal}
        onConfirm={payPayment}
        onChangePaymentDate={setPaymentDate}
        onSelectMethod={setPaymentMethod}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar mensualidad"
        description={`Se eliminará el cobro ${deleteTarget?.mes}/${deleteTarget?.anio} de ${deleteTarget?.student.nombre} ${deleteTarget?.student.apellido}.`}
        notice="Elimina esta mensualidad solo si fue creada por error y no debe seguir afectando la cartera."
        onClose={() => setDeleteTarget(null)}
        onConfirm={deletePayment}
      />
    </div>
  );
}

function defaultDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
