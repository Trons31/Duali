"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { clientApiFetch } from "@/lib/client-api";
import { currency, formatDate } from "@/lib/web-utils";
import type { ExpenseItem } from "@/lib/web-types";

type ExpenseFormValues = {
  concepto: string;
  descripcion?: string;
  monto: number;
  fecha: string;
  categoria?: string;
};

export function ExpensesPanel({ expenses }: { expenses: ExpenseItem[] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<ExpenseItem | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<ExpenseFormValues>({
    defaultValues: {
      concepto: "",
      descripcion: "",
      monto: 0,
      fecha: new Date().toISOString().slice(0, 10),
      categoria: ""
    }
  });

  const token = session?.user.apiToken ?? "";

  async function onSubmit(values: ExpenseFormValues) {
    await clientApiFetch("/api/expenses", token, {
      method: "POST",
      body: JSON.stringify(values)
    })
      .then(() => {
        sileo.success({ title: "Egreso registrado" });
        reset();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  async function deleteExpense() {
    if (!deleteTarget) return;
    await clientApiFetch(`/api/expenses/${deleteTarget.id}`, token, { method: "DELETE" })
      .then(() => {
        sileo.success({ title: "Egreso eliminado" });
        setDeleteTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  return (
    <div className="space-y-6">
      <form className="shell-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5" onSubmit={handleSubmit(onSubmit)}>
        <div className="lg:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-ink-700">Concepto</label>
          <input className="field-base" {...register("concepto", { required: true })} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink-700">Monto</label>
          <input type="number" className="field-base" {...register("monto", { valueAsNumber: true })} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink-700">Fecha</label>
          <input type="date" className="field-base" {...register("fecha")} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink-700">Categoría</label>
          <input className="field-base" {...register("categoria")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <label className="mb-2 block text-sm font-semibold text-ink-700">Descripción</label>
          <textarea className="field-base min-h-28" {...register("descripcion")} />
        </div>
        <div className="lg:col-span-5">
          <Button type="submit" loading={isSubmitting}>
            Registrar egreso
          </Button>
        </div>
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        {expenses.map((expense) => (
          <article key={expense.id} className="shell-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink-400">
                  {expense.categoria || "General"}
                </p>
                <h3 className="mt-2 text-xl font-black text-ink-950">{expense.concepto}</h3>
                <p className="mt-2 text-sm text-ink-500">{expense.descripcion || "Sin descripción."}</p>
              </div>
              <Button type="button" variant="danger" onClick={() => setDeleteTarget(expense)}>
                Eliminar
              </Button>
            </div>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">Fecha</p>
                <p className="mt-2 font-semibold text-ink-900">{formatDate(expense.fecha)}</p>
              </div>
              <p className="text-2xl font-black text-rose-700">{currency(expense.monto)}</p>
            </div>
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar egreso"
        description={`Eliminarás el egreso "${deleteTarget?.concepto}". Esta acción impacta tus métricas financieras.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteExpense}
      />
    </div>
  );
}
