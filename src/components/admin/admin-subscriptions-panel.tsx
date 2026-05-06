"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useForm } from "react-hook-form";
import { FiCheckCircle, FiCreditCard, FiLogOut, FiRefreshCw, FiUsers } from "react-icons/fi";
import { sileo } from "sileo";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { currency, formatDate } from "@/lib/web-utils";
import type { AdminSubscriptionClient, AdminSubscriptionsResponse } from "@/lib/web-types";

type PaymentFormValues = {
  paymentMethod: string;
  paidAt: string;
  notes: string;
};

export function AdminSubscriptionsPanel({ data }: { data: AdminSubscriptionsResponse }) {
  const router = useRouter();
  const [selectedClient, setSelectedClient] = useState<AdminSubscriptionClient | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<PaymentFormValues>({
    defaultValues: {
      paymentMethod: "transferencia",
      paidAt: new Date().toISOString().slice(0, 10),
      notes: ""
    }
  });

  function closeModal() {
    setSelectedClient(null);
    reset({
      paymentMethod: "transferencia",
      paidAt: new Date().toISOString().slice(0, 10),
      notes: ""
    });
  }

  async function handleLogout() {
    await signOut({ redirect: false });
    router.replace("/auth/login");
    router.refresh();
  }

  async function onSubmit(values: PaymentFormValues) {
    if (!selectedClient) return;

    const response = await fetch(`/api/admin/subscriptions/${selectedClient.subscription.id}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentMethod: values.paymentMethod,
        paidAt: values.paidAt,
        notes: values.notes || null
      })
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      sileo.error({ title: payload?.error ?? "No se pudo registrar el pago" });
      return;
    }

    sileo.success({ title: "Pago del plan registrado" });
    closeModal();
    startTransition(() => router.refresh());
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-brand-700">Administración</p>
            <h1 className="mt-2 text-[2rem] font-black leading-none text-ink-950">Clientes y planes</h1>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleLogout}
          >
            <FiLogOut className="size-4" />
            Salir
          </Button>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AdminStat label="Clientes" value={String(data.summary.totalClients)} helper="registrados" icon={<FiUsers />} />
          <AdminStat label="Activos" value={String(data.summary.active)} helper="al día" icon={<FiCheckCircle />} />
          <AdminStat label="Vencidos" value={String(data.summary.overdue)} helper="por revisar" icon={<FiRefreshCw />} />
          <AdminStat label="MRR" value={currency(data.summary.monthlyRevenue)} helper="estimado" icon={<FiCreditCard />} />
        </section>

        <section className="rounded-[28px] border border-ink-100 bg-white shadow-soft">
          <div className="border-b border-ink-100 px-5 py-4">
            <h2 className="text-base font-black text-ink-950">Clientes</h2>
            <p className="mt-1 text-xs text-ink-500">Marca el pago mensual del plan cuando recibas el dinero.</p>
          </div>
          <div className="divide-y divide-ink-100">
            {data.clients.map((client) => {
              const overdue = client.subscription.daysUntilNextBilling < 0;

              return (
                <article key={client.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink-950">{client.businessName}</p>
                    <p className="mt-1 truncate text-xs text-ink-500">{client.nombre} - {client.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink-400">Próximo cobro</p>
                    <p className={overdue ? "mt-1 text-sm font-black text-rose-600" : "mt-1 text-sm font-black text-brand-600"}>
                      {formatDate(client.subscription.nextBillingAt)}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {overdue
                        ? `${Math.abs(client.subscription.daysUntilNextBilling)} días vencido`
                        : `Faltan ${client.subscription.daysUntilNextBilling} días`}
                    </p>
                  </div>
                  <Button type="button" className="w-full md:w-auto" onClick={() => setSelectedClient(client)}>
                    Marcar pago
                  </Button>
                </article>
              );
            })}

            {!data.clients.length ? (
              <div className="px-5 py-8 text-sm text-ink-500">Aún no hay clientes registrados.</div>
            ) : null}
          </div>
        </section>
      </div>

      <Modal
        open={Boolean(selectedClient)}
        title="Registrar pago"
        description={selectedClient ? selectedClient.businessName : undefined}
        onClose={closeModal}
        footer={
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={closeModal}>
              Cancelar
            </Button>
            <Button type="submit" form="admin-subscription-payment-form" className="flex-1" loading={isSubmitting || isPending}>
              Confirmar
            </Button>
          </div>
        }
      >
        {selectedClient ? (
          <form id="admin-subscription-payment-form" className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="rounded-2xl bg-brand-50 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Plan</p>
              <p className="mt-2 text-lg font-black text-ink-950">{selectedClient.subscription.plan.name}</p>
              <p className="mt-1 text-sm font-bold text-brand-700">{currency(selectedClient.subscription.price)}</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">Método de pago</label>
              <select className="field-base" {...register("paymentMethod")}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="nequi">Nequi</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">Fecha de pago</label>
              <input type="date" className="field-base" {...register("paidAt")} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">Notas</label>
              <textarea className="field-base min-h-24" {...register("notes")} />
            </div>
          </form>
        ) : null}
      </Modal>
    </main>
  );
}

function AdminStat({
  label,
  value,
  helper,
  icon
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-[22px] border border-ink-100 bg-white px-4 py-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold text-ink-500">{label}</p>
        <div className="text-brand-600">{icon}</div>
      </div>
      <p className="mt-4 text-[1.15rem] font-black text-ink-950">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{helper}</p>
    </article>
  );
}
