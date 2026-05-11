"use client";

import { useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiClock, FiDollarSign } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PAYMENT_METHODS, type PaymentMethodValue } from "@/components/ui/payment-method-modal";
import { cn, currency, formatDate } from "@/lib/web-utils";
import type { PaymentInstallmentItem } from "@/lib/web-types";

export type InstallmentModalPayment = {
  id: string;
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  mode?: "history" | "payment";
  studentName: string;
  concept: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  installmentCount: number;
  lastMethod?: string | null;
  lastDate?: string | null;
  prefillRemaining?: boolean;
  installments?: PaymentInstallmentItem[];
};

export type InstallmentSubmitValues = {
  monto: number;
  metodoPago: PaymentMethodValue;
  fechaAbono: string;
};

export function PaymentInstallmentModal({
  open,
  payment,
  loading = false,
  onClose,
  onSubmit
}: {
  open: boolean;
  payment: InstallmentModalPayment | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (values: InstallmentSubmitValues) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethodValue>(PAYMENT_METHODS[0].value);
  const [date, setDate] = useState(todayInputValue());
  const mode = payment?.mode ?? "payment";
  const isHistoryMode = mode === "history";

  useEffect(() => {
    if (!open || !payment) return;

    setAmount(payment.prefillRemaining && mode === "payment" ? String(payment.remainingAmount) : "");
    setMethod(PAYMENT_METHODS[0].value);
    setDate(todayInputValue());
  }, [mode, open, payment]);

  const numericAmount = Number(amount);
  const validationError = useMemo(() => {
    if (!payment || isHistoryMode) return "";
    if (!amount.trim()) return "Ingresa el valor del abono";
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return "El abono debe ser mayor a cero";
    if (numericAmount > payment.remainingAmount) return "El abono no puede superar el saldo pendiente";
    if (!method) return "Selecciona un metodo de pago";
    if (!date) return "Selecciona la fecha del abono";
    return "";
  }, [amount, date, isHistoryMode, method, numericAmount, payment]);

  if (!payment) return null;

  const activePayment = payment;
  const progress =
    activePayment.totalAmount > 0
      ? Math.min(100, Math.round((activePayment.paidAmount / activePayment.totalAmount) * 100))
      : 0;

  function submit() {
    if (validationError || !payment) return;
    onSubmit({ monto: numericAmount, metodoPago: method, fechaAbono: date });
  }

  function payRemaining() {
    setAmount(String(activePayment.remainingAmount));
  }

  return (
    <Modal
      open={open}
      title={isHistoryMode ? "Historial de abonos" : "Pagar saldo"}
      description={`${activePayment.studentName} - ${activePayment.concept}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <BalanceTile label="Valor total" value={currency(activePayment.totalAmount)} />
          <BalanceTile label="Total abonado" value={currency(activePayment.paidAmount)} tone="paid" />
          <BalanceTile label="Saldo restante" value={currency(activePayment.remainingAmount)} tone="remaining" />
        </div>

        <div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-ink-500">
            <span>{progress}% abonado</span>
            <span>{activePayment.installmentCount} abono{activePayment.installmentCount === 1 ? "" : "s"}</span>
          </div>
        </div>

        {isHistoryMode ? null : (
          <>
            <div className="grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-ink-950">Valor abonado</span>
                <input
                  type="number"
                  min="1"
                  max={activePayment.remainingAmount}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="field-base h-12 rounded-[18px]"
                  placeholder="0"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-ink-950">Fecha del abono</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="field-base h-12 rounded-[18px]"
                />
              </label>
            </div>

            <div>
              <p className="text-sm font-black text-ink-950">Metodo de pago</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {PAYMENT_METHODS.map((paymentMethod) => {
                  const active = method === paymentMethod.value;

                  return (
                    <button
                      key={paymentMethod.value}
                      type="button"
                      onClick={() => setMethod(paymentMethod.value)}
                      className={cn(
                        "rounded-[18px] border px-4 py-3 text-sm font-black transition",
                        active
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-ink-100 bg-ink-50 text-ink-500 hover:border-ink-200 hover:bg-ink-100 hover:text-ink-800"
                      )}
                    >
                      {paymentMethod.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activePayment.installments?.length ? (
          <div className="border-t border-ink-100 pt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-ink-950">
              <FiClock className="size-4" />
              Historial de abonos
            </div>
            <div className="space-y-3">
              {activePayment.installments.map((installment) => (
                <div key={installment.id} className="rounded-[18px] border border-ink-100 bg-ink-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-ink-950">
                        Abono #{installment.numero} - {formatDate(installment.fechaAbono)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-ink-500">
                        {installment.metodoPago} · {installment.registradoPorNombre ?? "Administrador"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-black text-brand-700">{currency(installment.monto)}</p>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs font-semibold text-ink-500 sm:grid-cols-2">
                    <span>Saldo anterior: {currency(installment.saldoAnterior)}</span>
                    <span>Saldo restante: {currency(installment.saldoRestante)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isHistoryMode ? null : (
          <>
            {validationError ? <p className="text-sm font-bold text-rose-600">{validationError}</p> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-14 rounded-[20px]"
                onClick={payRemaining}
                disabled={loading || activePayment.remainingAmount <= 0}
              >
                <FiDollarSign className="size-5" />
                Completar saldo
              </Button>
              <Button
                type="button"
                className="min-h-14 rounded-[20px]"
                onClick={submit}
                loading={loading}
                disabled={Boolean(validationError)}
              >
                <FiCheckCircle className="size-5" />
                Guardar pago
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function BalanceTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "paid" | "remaining" }) {
  return (
    <div
      className={cn(
        "rounded-[18px] border px-4 py-3",
        tone === "paid" && "border-emerald-100 bg-emerald-50",
        tone === "remaining" && "border-amber-100 bg-amber-50",
        tone === "default" && "border-ink-100 bg-ink-50"
      )}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-400">{label}</p>
      <p className="mt-2 text-base font-black text-ink-950">{value}</p>
    </div>
  );
}

function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
