"use client";

import { useState } from "react";
import Link from "next/link";
import { FiCheck, FiX } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { PAYMENT_METHODS } from "@/components/ui/payment-method-modal";
import { ColorDot, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import { memberName } from "@/components/dashboard/studio-sales-ui";
import { paymentMethodFromName } from "@/lib/online-payments";
import type { ReceiptView } from "@/lib/receipts";
import { cn, currency, formatDateTime } from "@/lib/web-utils";

/** Spec 014 R5: comprobantes por revisar, con aprobar (registra el pago) o rechazar. */
export function ReceiptReviewList({ receipts, showMember = true }: { receipts: ReceiptView[]; showMember?: boolean }) {
  const [reviewing, setReviewing] = useState<{ receipt: ReceiptView; action: "approve" | "reject" } | null>(null);

  if (!receipts.length) return <p className="py-4 text-center text-xs text-ink-400">No hay comprobantes por revisar</p>;

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {receipts.map((receipt) => (
          <li key={receipt.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
            <a href={receipt.url} target="_blank" rel="noopener noreferrer" title="Ver comprobante completo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receipt.url} alt="Comprobante" loading="lazy" className="h-40 w-full bg-ink-50 object-contain" />
            </a>
            <div className="space-y-2 p-3">
              {showMember ? (
                <Link href={`/dashboard/clientes/${receipt.member.id}`} className="block truncate text-sm font-semibold text-ink-800 hover:underline">
                  {memberName(receipt.member)}
                </Link>
              ) : null}
              {receipt.sale.origen === "PUBLICO" ? (
                <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                  {receipt.bookingId ? "Compró en línea al reservar" : "Compró en línea"}
                </span>
              ) : null}
              <p className="flex items-center gap-1.5 text-xs text-ink-500">
                <ColorDot color={receipt.sale.discipline.color} className="size-2" />
                {receipt.sale.nombre} {receipt.sale.discipline.nombre} · saldo {currency(receipt.sale.saldo)}
              </p>
              <p className="text-[11px] text-ink-400">
                {formatDateTime(receipt.createdAt)}
                {receipt.metodoPago ? ` · pagó por ${receipt.metodoPago}` : ""}
              </p>
              <div className="flex gap-2">
                <Button className="flex-1 rounded-xl px-3 py-1.5 text-xs shadow-none" onClick={() => setReviewing({ receipt, action: "approve" })}>
                  <FiCheck className="size-3.5" />
                  Aprobar
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-xl px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                  onClick={() => setReviewing({ receipt, action: "reject" })}
                >
                  <FiX className="size-3.5" />
                  Rechazar
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {reviewing ? <ReviewModal key={reviewing.receipt.id + reviewing.action} {...reviewing} onClose={() => setReviewing(null)} /> : null}
    </>
  );
}

function ReviewModal({ receipt, action, onClose }: { receipt: ReceiptView; action: "approve" | "reject"; onClose: () => void }) {
  const request = useStudioRequest();
  const [monto, setMonto] = useState(String(receipt.sale.saldo));
  // Spec 021 R11: el metodo que eligio la clienta, ya seleccionado.
  const [metodoPago, setMetodoPago] = useState<string>(paymentMethodFromName(receipt.metodoPago));
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const amount = Number(monto || 0);

  async function submit() {
    setSaving(true);
    const done =
      action === "approve"
        ? await request(
            `/api/payment-receipts/${receipt.id}/approve`,
            { method: "POST", body: JSON.stringify({ monto: amount, metodoPago }) },
            "Pago registrado"
          )
        : await request(`/api/payment-receipts/${receipt.id}/reject`, { method: "POST", body: JSON.stringify({ motivo }) }, "Comprobante rechazado");
    setSaving(false);
    if (done) onClose();
  }

  return (
    <Modal size="md"
      open
      onClose={() => (saving ? undefined : onClose())}
      title={action === "approve" ? "Aprobar y registrar pago" : "Rechazar comprobante"}
      description={`${memberName(receipt.member)} · ${receipt.sale.nombre} ${receipt.sale.discipline.nombre} · saldo ${currency(receipt.sale.saldo)}`}
    >
      <div className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={receipt.url} alt="Comprobante" className="max-h-64 w-full rounded-xl bg-ink-50 object-contain" />
        {action === "approve" ? (
          <>
            <div>
              <span className={labelClass}>Monto que dice el comprobante</span>
              <MoneyInput value={monto} onChange={setMonto} className="h-[42px] rounded-xl py-2.5 text-sm" aria-label="Monto" />
              {amount > receipt.sale.saldo ? <p className="mt-1 text-[11px] text-rose-600">Supera el saldo</p> : null}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  aria-pressed={metodoPago === method.value}
                  onClick={() => setMetodoPago(method.value)}
                  className={cn(
                    "rounded-xl border px-2 py-1.5 text-xs font-medium",
                    metodoPago === method.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600"
                  )}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div>
            <label className={labelClass} htmlFor="reject-motivo">
              Motivo <span className="text-ink-400">(la clienta lo verá en Mi plan)</span>
            </label>
            <input id="reject-motivo" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ej: no se ve el monto" className={inputClass} />
          </div>
        )}
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={action === "approve" ? "primary" : "danger"}
            className="flex-1 rounded-xl py-2.5 shadow-none"
            loading={saving}
            disabled={action === "approve" ? amount <= 0 || amount > receipt.sale.saldo : motivo.trim().length < 3}
            onClick={submit}
          >
            {action === "approve" ? `Registrar ${currency(amount)}` : "Rechazar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
