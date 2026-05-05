"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { clientApiFetch } from "@/lib/client-api";
import { currency, formatDate } from "@/lib/web-utils";
import type { EnrollmentPaymentItem } from "@/lib/web-types";

export function EnrollmentPaymentsPanel({ payments }: { payments: EnrollmentPaymentItem[] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [payTarget, setPayTarget] = useState<EnrollmentPaymentItem | null>(null);
  const token = session?.user.apiToken ?? "";

  async function payCurrent() {
    if (!payTarget) return;
    await clientApiFetch(`/api/enrollment-payments/${payTarget.id}/pay`, token, {
      method: "PUT",
      body: JSON.stringify({})
    })
      .then(() => {
        sileo.success({ title: "Inscripción marcada como pagada" });
        setPayTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  return (
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
              <p className="mt-2 text-sm text-ink-500">{payment.student.group?.nombre ?? "Sin grupo"}</p>
              <p className="mt-1 text-sm text-ink-500">Vence {formatDate(payment.fechaVencimiento)}</p>
            </div>
            <p className="text-xl font-black text-brand-700">{currency(payment.monto)}</p>
          </div>
          {payment.estado !== "PAGADO" ? (
            <div className="mt-5">
              <Button type="button" onClick={() => setPayTarget(payment)}>
                Marcar pago
              </Button>
            </div>
          ) : null}
        </article>
      ))}

      <ConfirmDialog
        open={Boolean(payTarget)}
        title="Confirmar pago de inscripción"
        description={`Registrarás el pago de la inscripción de ${payTarget?.student.nombre} ${payTarget?.student.apellido}.`}
        variant="primary"
        confirmText="Confirmar pago"
        onClose={() => setPayTarget(null)}
        onConfirm={payCurrent}
      />
    </div>
  );
}
