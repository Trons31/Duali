"use client";

import { useEffect, useId, useState } from "react";
import { FiCreditCard, FiGitBranch } from "react-icons/fi";
import { MoneyInput } from "@/components/ui/money-input";
import { PAYMENT_METHODS } from "@/components/ui/payment-method-modal";
import { SelectField } from "@/components/ui/select-field";
import { balanceParts, paymentPartsError, type PaymentPart } from "@/lib/payment-breakdown";
import { cn, currency } from "@/lib/web-utils";

/**
 * Spec 027 D2: método de pago con "Pago en dos partes" (como el
 * PaymentBreakdownSelector de CliqCut). Con un método, ese método lleva el
 * total; con dos, cada parte con su valor y la otra se ajusta sola para
 * completar el total.
 */
export function PaymentBreakdown({
  total,
  value,
  onChange,
  label = "Método de pago",
  disabled = false
}: {
  total: number;
  value: PaymentPart[];
  onChange: (parts: PaymentPart[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const fieldId = useId();
  const isSplit = value.length === 2;

  // Con un método, siempre por el total (el total cambia si cambian el monto).
  useEffect(() => {
    if (value.length === 1 && value[0].monto !== total) onChange([{ ...value[0], monto: total }]);
  }, [onChange, total, value]);

  function enableSplit() {
    const first = value[0]?.metodo ?? "EFECTIVO";
    const second = first === "NEQUI" ? "EFECTIVO" : "NEQUI";
    onChange([
      { metodo: first, monto: 0 },
      { metodo: second, monto: total }
    ]);
  }

  const received = value.reduce((sum, part) => sum + (Number(part.monto) || 0), 0);
  const error = isSplit ? paymentPartsError(total, value) : null;

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-sm font-semibold text-ink-700">{label}</legend>
        <button
          type="button"
          aria-pressed={isSplit}
          onClick={isSplit ? () => onChange([{ metodo: value[0]?.metodo ?? "EFECTIVO", monto: total }]) : enableSplit}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
            isSplit ? "bg-brand-100 text-brand-700 hover:bg-brand-200" : "bg-ink-100 text-ink-700 hover:bg-ink-200"
          )}
        >
          <FiGitBranch className="size-4" aria-hidden />
          {isSplit ? "Usar un solo método" : "Pago en dos partes"}
        </button>
      </div>

      {!isSplit ? (
        <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAYMENT_METHODS.map((method) => {
            const selected = value[0]?.metodo === method.value;
            return (
              <button
                key={method.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange([{ metodo: method.value, monto: total }])}
                className={cn(
                  "min-h-11 rounded-xl border-2 px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                  selected ? "border-brand-500 bg-brand-500 text-white" : "border-ink-200 bg-white text-ink-600 hover:border-brand-200"
                )}
              >
                {method.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
          <div className="space-y-3">
            {value.map((part, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.8fr)]">
                <div>
                  <label htmlFor={`${fieldId}-method-${index}`} className="mb-1 block text-xs font-semibold text-ink-600">
                    Método {index + 1}
                  </label>
                  <SelectField
                    id={`${fieldId}-method-${index}`}
                    value={part.metodo}
                    onChange={(event) => onChange(value.map((item, position) => (position === index ? { ...item, metodo: event.target.value } : item)))}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value} disabled={value.some((item, position) => position !== index && item.metodo === method.value)}>
                        {method.label}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-ink-600">Valor</span>
                  <MoneyInput
                    value={part.monto ? String(part.monto) : ""}
                    onChange={(next) => onChange(balanceParts(total, value, index, Number(next || 0)))}
                    className="h-11 rounded-xl py-2 text-right text-sm font-bold tabular-nums"
                    aria-label={`Valor del método ${index + 1}`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div
            className={cn(
              "mt-3 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs",
              error ? "bg-white text-ink-600" : "bg-brand-100 text-brand-800"
            )}
          >
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <FiCreditCard className="size-4" aria-hidden />
              Total recibido
            </span>
            <span className="font-black tabular-nums">{currency(received)}</span>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-xs font-semibold text-amber-700">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </fieldset>
  );
}

/** Estado del selector: arranca en efectivo por el total. */
export function usePaymentParts(total: number) {
  return useState<PaymentPart[]>(() => [{ metodo: "EFECTIVO", monto: total }]);
}

/** Lo que se manda a la API: el método de siempre, o las dos partes. */
export function paymentPayload(parts: PaymentPart[]) {
  return parts.length > 1
    ? { partes: parts.map((part) => ({ metodo: part.metodo, monto: Number(part.monto) })) }
    : { metodoPago: parts[0]?.metodo ?? "EFECTIVO" };
}

/** "Efectivo", o "Efectivo $100.000 + Nequi $60.000" si fue en dos partes. */
export function describeMethod(metodoPago: string | null, partes?: PaymentPart[] | null) {
  const label = (value: string) => PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;
  if (partes && partes.length > 1) return partes.map((part) => `${label(part.metodo)} ${currency(part.monto)}`).join(" + ");
  if (!metodoPago) return "Sin método";
  if (metodoPago === "MIXTO") return "Dos partes";
  return label(metodoPago);
}
