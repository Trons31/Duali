"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { clientApiFetch } from "@/lib/client-api";
import { currency, formatDate } from "@/lib/web-utils";

type DuePayment = {
  id: string;
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  monto: number | string;
  fechaVencimiento: string;
  student: {
    nombre: string;
    apellido: string;
  };
  group?: {
    nombre: string;
  } | null;
};

export function DuePaymentsPanel({
  items,
  titleAction
}: {
  items: DuePayment[];
  titleAction: "pendiente" | "vencido";
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [payTarget, setPayTarget] = useState<DuePayment | null>(null);
  const token = session?.user.apiToken ?? "";

  async function payCurrent() {
    if (!payTarget) return;
    const endpoint =
      payTarget.kind === "MONTHLY_PAYMENT"
        ? `/api/monthly-payments/${payTarget.id}/pay`
        : `/api/enrollment-payments/${payTarget.id}/pay`;

    await clientApiFetch(endpoint, token, {
      method: "PUT",
      body: JSON.stringify({})
    })
      .then(() => {
        sileo.success({ title: "Cobro registrado como pagado" });
        setPayTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <article key={`${item.kind}-${item.id}`} className="shell-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-400">
                {item.kind === "MONTHLY_PAYMENT" ? "Mensualidad" : "Inscripción"}
              </p>
              <h3 className="mt-2 text-xl font-black text-ink-950">
                {item.student.nombre} {item.student.apellido}
              </h3>
              <p className="mt-2 text-sm text-ink-500">
                {item.group?.nombre ?? "Sin grupo"} • vence {formatDate(item.fechaVencimiento)}
              </p>
            </div>
            <p className="text-xl font-black text-rose-700">{currency(item.monto)}</p>
          </div>
          <div className="mt-5">
            <Button type="button" onClick={() => setPayTarget(item)}>
              Marcar pago
            </Button>
          </div>
        </article>
      ))}

      <ConfirmDialog
        open={Boolean(payTarget)}
        title={`Marcar cobro ${titleAction === "pendiente" ? "pendiente" : "vencido"} como pagado`}
        description={`Confirmarás el pago de ${payTarget?.student.nombre} ${payTarget?.student.apellido}.`}
        variant="primary"
        confirmText="Confirmar pago"
        onClose={() => setPayTarget(null)}
        onConfirm={payCurrent}
      />
    </div>
  );
}
