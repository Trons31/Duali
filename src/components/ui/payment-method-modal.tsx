"use client";

import { FiCheckCircle } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn, currency } from "@/lib/web-utils";

export const PAYMENT_METHODS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "NEQUI", label: "Nequi" },
  { value: "OTRO", label: "Otro" }
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"];

export function PaymentMethodModal({
  open,
  title,
  description,
  notice,
  amount,
  selectedMethod,
  confirmText = "Confirmar pago",
  loading = false,
  onClose,
  onConfirm,
  onSelectMethod
}: {
  open: boolean;
  title: string;
  description: string;
  notice?: string;
  amount?: number | string | null;
  selectedMethod: PaymentMethodValue;
  confirmText?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSelectMethod: (value: PaymentMethodValue) => void;
}) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose}>
      <div className="space-y-5">
        {amount !== undefined && amount !== null ? (
          <div className="flex items-center justify-between gap-4 rounded-[24px] border border-ink-100 bg-ink-50/70 px-4 py-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-400">Monto</p>
              <p className="mt-2 text-[1.8rem] font-black tracking-tight text-brand-700">{currency(amount)}</p>
            </div>
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-[24px] bg-brand-50 px-4 py-4 text-sm leading-6 text-brand-800">{notice}</div>
        ) : null}

        <div className="border-t border-ink-100 pt-5">
          <p className="text-base font-black text-ink-950">Metodo de pago</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {PAYMENT_METHODS.map((method) => {
              const active = selectedMethod === method.value;

              return (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => onSelectMethod(method.value)}
                  className={cn(
                    "rounded-[20px] border px-4 py-4 text-sm font-black transition",
                    active
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-ink-100 bg-ink-50 text-ink-500 hover:border-ink-200 hover:bg-ink-100 hover:text-ink-800"
                  )}
                >
                  {method.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <Button type="button" className="min-h-14 w-full rounded-[22px]" onClick={onConfirm} loading={loading}>
            <FiCheckCircle className="size-5" />
            {confirmText}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-[18px] px-4 py-3 text-base font-black text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
