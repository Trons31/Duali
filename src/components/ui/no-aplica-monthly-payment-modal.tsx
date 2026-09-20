"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type NoAplicaMonthlyPaymentTarget = {
  id: string;
  studentName: string;
  concept: string;
  amount: number | string;
};

export function NoAplicaMonthlyPaymentModal({
  open,
  target,
  loading,
  onClose,
  onConfirm
}: {
  open: boolean;
  target: NoAplicaMonthlyPaymentTarget | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (values: { motivo: string; fechaProximoCobro?: string }) => void;
}) {
  const [motivo, setMotivo] = useState("Aplazo el mes");
  const [fechaProximoCobro, setFechaProximoCobro] = useState("");

  function close() {
    if (loading) return;
    setMotivo("Aplazo el mes");
    setFechaProximoCobro("");
    onClose();
  }

  function submit() {
    const trimmedMotivo = motivo.trim();
    if (!trimmedMotivo) return;

    onConfirm({
      motivo: trimmedMotivo,
      fechaProximoCobro: fechaProximoCobro || undefined
    });
  }

  return (
    <Modal
      open={open}
      title="Marcar No aplica"
      description={target ? `${target.studentName} - ${target.concept}` : "Este cobro no contara como deuda."}
      onClose={close}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" className="min-h-12 rounded-[18px]" onClick={close} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" className="min-h-12 rounded-[18px]" onClick={submit} loading={loading} disabled={!motivo.trim()}>
            Confirmar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[22px] border border-slate-100 bg-slate-50 px-4 py-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Cobro</p>
          <p className="mt-2 text-base font-black text-ink-950">{target?.concept ?? "Mensualidad"}</p>
          <p className="mt-1 text-sm font-semibold text-ink-500">{target?.studentName}</p>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-black text-ink-900">Motivo</span>
          <textarea
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            className="field-base min-h-24 resize-none rounded-[18px]"
            placeholder="Ej. Estuvo enferma, aplazo el mes o no asistio."
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-black text-ink-900">Proxima fecha de cobro</span>
          <input
            type="date"
            value={fechaProximoCobro}
            onChange={(event) => setFechaProximoCobro(event.target.value)}
            className="field-base rounded-[18px]"
          />
          <span className="mt-2 block text-xs font-semibold leading-5 text-ink-500">
            Opcional. Si la defines, el sistema actualiza el dia de cobro y prepara la siguiente mensualidad para esa fecha.
          </span>
        </label>
      </div>
    </Modal>
  );
}
