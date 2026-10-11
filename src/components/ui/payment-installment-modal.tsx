"use client";

import { useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiClock, FiDollarSign, FiEdit2, FiTrash2 } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PAYMENT_METHODS, type PaymentMethodValue } from "@/components/ui/payment-method-modal";
import { describeMethod, PaymentBreakdown } from "@/components/ui/payment-breakdown";
import { paymentPartsError, type PaymentPart } from "@/lib/payment-breakdown";
import { MoneyInput } from "@/components/ui/money-input";
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
  metodoPago?: PaymentMethodValue;
  /** Spec 027: el abono en dos partes. */
  partes?: PaymentPart[];
  fechaAbono: string;
};

export function PaymentInstallmentModal({
  open,
  payment,
  loading = false,
  onClose,
  onSubmit,
  onEditInstallment,
  onDeleteInstallment
}: {
  open: boolean;
  payment: InstallmentModalPayment | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (values: InstallmentSubmitValues) => void;
  onEditInstallment?: (installmentId: string, values: InstallmentSubmitValues) => Promise<void>;
  onDeleteInstallment?: (installmentId: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethodValue>(PAYMENT_METHODS[0].value);
  // Spec 027: con "Pago en dos partes" quedan dos; con uno, `method`.
  const [parts, setParts] = useState<PaymentPart[]>([{ metodo: PAYMENT_METHODS[0].value, monto: 0 }]);
  const [date, setDate] = useState(todayInputValue());
  const [editingInstallment, setEditingInstallment] = useState<PaymentInstallmentItem | null>(null);
  const [deletingInstallment, setDeletingInstallment] = useState<PaymentInstallmentItem | null>(null);
  const [mutatingInstallment, setMutatingInstallment] = useState(false);
  const mode = payment?.mode ?? "payment";
  const isHistoryMode = mode === "history";

  useEffect(() => {
    if (!open || !payment) return;

    setAmount(payment.prefillRemaining && mode === "payment" ? String(payment.remainingAmount) : "");
    setMethod(PAYMENT_METHODS[0].value);
    setParts([{ metodo: PAYMENT_METHODS[0].value, monto: 0 }]);
    setDate(todayInputValue());
    setEditingInstallment(null);
    setDeletingInstallment(null);
  }, [mode, open, payment]);

  const numericAmount = Number(amount);
  const validationError = useMemo(() => {
    if (!payment || (isHistoryMode && !editingInstallment)) return "";
    if (!amount.trim()) return "Ingresa el valor del abono";
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return "El abono debe ser mayor a cero";
    const availableAmount = payment.remainingAmount + Number(editingInstallment?.monto ?? 0);
    if (numericAmount > availableAmount) return "El abono no puede superar el saldo pendiente";
    if (!method) return "Selecciona un metodo de pago";
    if (parts.length > 1) {
      const splitError = paymentPartsError(numericAmount, parts);
      if (splitError) return splitError;
    }
    if (!date) return "Selecciona la fecha del abono";
    return "";
  }, [amount, date, editingInstallment, isHistoryMode, method, numericAmount, parts, payment]);

  if (!payment) return null;

  const activePayment = payment;
  const progress =
    activePayment.totalAmount > 0
      ? Math.min(100, Math.round((activePayment.paidAmount / activePayment.totalAmount) * 100))
      : 0;

  function submit() {
    if (validationError || !payment) return;
    onSubmit({ monto: numericAmount, ...methodValues(), fechaAbono: date });
  }

  function methodValues(): Pick<InstallmentSubmitValues, "metodoPago" | "partes"> {
    return parts.length > 1 ? { partes: parts } : { metodoPago: method };
  }

  function changeParts(next: PaymentPart[]) {
    setParts(next);
    if (next.length === 1) setMethod(next[0].metodo as PaymentMethodValue);
  }

  function payRemaining() {
    setAmount(String(activePayment.remainingAmount));
  }

  function startEditing(installment: PaymentInstallmentItem) {
    setDeletingInstallment(null);
    setEditingInstallment(installment);
    setAmount(String(installment.monto));
    // Un abono en dos partes se vuelve a repartir al editarlo.
    const known = PAYMENT_METHODS.some((item) => item.value === installment.metodoPago);
    setMethod(known ? (installment.metodoPago as PaymentMethodValue) : PAYMENT_METHODS[0].value);
    setParts([{ metodo: known ? installment.metodoPago : PAYMENT_METHODS[0].value, monto: Number(installment.monto) }]);
    setDate(dateInputValue(installment.fechaAbono));
  }

  function cancelEditing() {
    setEditingInstallment(null);
    setAmount("");
    setMethod(PAYMENT_METHODS[0].value);
    setParts([{ metodo: PAYMENT_METHODS[0].value, monto: 0 }]);
    setDate(todayInputValue());
  }

  async function saveEditedInstallment() {
    if (!editingInstallment || !onEditInstallment || validationError) return;
    setMutatingInstallment(true);
    await onEditInstallment(editingInstallment.id, { monto: numericAmount, ...methodValues(), fechaAbono: date })
      .then(cancelEditing)
      .catch(() => undefined)
      .finally(() => setMutatingInstallment(false));
  }

  async function deleteInstallment() {
    if (!deletingInstallment || !onDeleteInstallment) return;
    setMutatingInstallment(true);
    await onDeleteInstallment(deletingInstallment.id)
      .then(() => setDeletingInstallment(null))
      .catch(() => undefined)
      .finally(() => setMutatingInstallment(false));
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

        {!isHistoryMode || editingInstallment ? (
          <>
            <div className="grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-ink-950">Valor abonado</span>
                <MoneyInput
                  value={amount}
                  onChange={setAmount}
                  className="h-12 rounded-[18px]"
                  placeholder="0"
                  aria-label="Valor abonado"
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

            <PaymentBreakdown
              total={Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : 0}
              value={parts}
              onChange={changeParts}
            />

            {editingInstallment ? (
              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="secondary" onClick={cancelEditing} disabled={mutatingInstallment}>
                  Cancelar
                </Button>
                <Button type="button" onClick={saveEditedInstallment} loading={mutatingInstallment} disabled={Boolean(validationError)}>
                  Guardar cambios
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

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
                        {describeMethod(installment.metodoPago)} · {installment.registradoPorNombre ?? "Administrador"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <p className="mr-1 text-sm font-black text-brand-700">{currency(installment.monto)}</p>
                      {isHistoryMode && activePayment.kind === "MONTHLY_PAYMENT" && onEditInstallment && onDeleteInstallment ? (
                        <>
                          <button
                            type="button"
                            aria-label={`Editar abono ${installment.numero}`}
                            title="Editar abono"
                            onClick={() => startEditing(installment)}
                            disabled={mutatingInstallment}
                            className="rounded-full p-2 text-ink-400 transition hover:bg-white hover:text-brand-700 disabled:opacity-50"
                          >
                            <FiEdit2 className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar abono ${installment.numero}`}
                            title="Eliminar abono"
                            onClick={() => {
                              setEditingInstallment(null);
                              setDeletingInstallment(installment);
                            }}
                            disabled={mutatingInstallment}
                            className="rounded-full p-2 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                          >
                            <FiTrash2 className="size-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
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

        {deletingInstallment ? (
          <div className="rounded-[18px] border border-rose-100 bg-rose-50 px-4 py-4">
            <p className="text-sm font-black text-rose-800">Eliminar abono #{deletingInstallment.numero}</p>
            <p className="mt-2 text-sm font-semibold text-rose-700">
              ¿Seguro que deseas eliminar este abono? Esta acción modificará el saldo restante.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setDeletingInstallment(null)} disabled={mutatingInstallment}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" onClick={deleteInstallment} loading={mutatingInstallment}>
                Eliminar abono
              </Button>
            </div>
          </div>
        ) : null}

        {isHistoryMode ? (
          editingInstallment && validationError ? <p className="text-sm font-bold text-rose-600">{validationError}</p> : null
        ) : (
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

function dateInputValue(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
