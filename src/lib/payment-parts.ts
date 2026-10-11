import { ApiError } from "@/lib/http";
import { resolvePaymentParts, type PaymentPart } from "@/lib/payment-breakdown";
import type { DbClient } from "@/lib/prisma-types";

// Spec 027 D3: guardar las partes de un pago dividido. Cada fila apunta a un solo pago.

export type PaymentPartsTarget =
  | { memberPackagePaymentId: string }
  | { paymentInstallmentId: string }
  | { monthlyPaymentId: string }
  | { enrollmentPaymentId: string }
  | { expenseId: string };

/** Lo que llega a la API: el metodoPago de siempre, o las partes (1 o 2). */
export type PaymentMethodInput = { metodoPago?: string | null; partes?: PaymentPart[] | null };

/** Valida contra el total y devuelve el metodoPago a guardar (MIXTO si son dos) y las partes. */
export function paymentPartsOrThrow(total: number, input: PaymentMethodInput) {
  const resolved = resolvePaymentParts(total, input);
  if (resolved.error) throw new ApiError(422, resolved.error);
  return { metodoPago: resolved.metodoPago, partes: resolved.partesGuardadas };
}

/** Deja exactamente esas partes en el pago (borra las anteriores). Sin partes, no queda ninguna. */
export async function savePaymentParts(tx: DbClient, clientId: string, target: PaymentPartsTarget, partes: PaymentPart[]) {
  await tx.paymentMethodPart.deleteMany({ where: { clientId, ...target } });
  if (!partes.length) return;
  await tx.paymentMethodPart.createMany({
    data: partes.map((part) => ({ clientId, metodo: part.metodo, monto: part.monto, ...target }))
  });
}

/** Para devolver al panel: las partes guardadas como números. */
export function serializeParts(rows: Array<{ metodo: string; monto: unknown }> | undefined | null): PaymentPart[] {
  return (rows ?? []).map((row) => ({ metodo: row.metodo, monto: Number(row.monto) }));
}

/**
 * Para los pagos de la academia, que aceptan métodos escritos libremente desde
 * antes: con una parte se respeta el método tal cual; solo con dos partes se
 * valida estrictamente (métodos conocidos y que sumen el total).
 */
export function lenientPaymentParts(total: number, input: PaymentMethodInput) {
  if (input.partes && input.partes.length > 1) return paymentPartsOrThrow(total, input);
  const metodoPago = (input.partes?.[0]?.metodo ?? input.metodoPago ?? "").trim();
  return { metodoPago, partes: [] as PaymentPart[] };
}
