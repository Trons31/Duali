// Spec 027: pago en una o dos partes (como lib/payment-breakdown de CliqCut).
// Funciones puras: las usan la API, los formularios y los informes.

export const PAYMENT_METHOD_VALUES = ["EFECTIVO", "NEQUI", "BANCOLOMBIA", "TRANSFERENCIA", "OTRO"] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHOD_VALUES)[number];

/** `metodoPago` del pago cuando se dividió en dos partes (D3). */
export const MIXED_METHOD = "MIXTO";

export type PaymentPart = { metodo: string; monto: number };

const cents = (value: number) => Math.round(Number(value) * 100);

/** null si las partes sirven para pagar `total`; si no, el motivo en palabras de la dueña. */
export function paymentPartsError(total: number, parts: readonly PaymentPart[]): string | null {
  if (!(cents(total) > 0)) return "El total del pago debe ser mayor a cero";
  if (parts.length < 1 || parts.length > 2) return "Registra uno o dos métodos de pago";

  const seen = new Set<string>();
  for (const part of parts) {
    if (!PAYMENT_METHOD_VALUES.includes(part.metodo as PaymentMethodCode)) return "Elige un método de pago válido";
    if (seen.has(part.metodo)) return "En un pago en dos partes elige dos métodos distintos";
    seen.add(part.metodo);
    if (!(cents(part.monto) > 0)) return "Cada parte debe ser mayor a cero";
  }

  const sum = parts.reduce((acc, part) => acc + cents(part.monto), 0);
  if (sum !== cents(total)) {
    const diff = (cents(total) - sum) / 100;
    return diff > 0
      ? `Falta registrar $${diff.toLocaleString("es-CO")}`
      : `Las partes superan el total por $${Math.abs(diff).toLocaleString("es-CO")}`;
  }
  return null;
}

/** El `metodoPago` que se guarda en el pago: el método, o MIXTO si son dos partes. */
export function summaryMethod(parts: readonly PaymentPart[]): string {
  return parts.length > 1 ? MIXED_METHOD : (parts[0]?.metodo ?? "OTRO");
}

/**
 * Al escribir el valor de una parte, la otra se ajusta para completar el total
 * (como balanceSplitPaymentParts de CliqCut). Nunca queda negativa.
 */
export function balanceParts(total: number, parts: readonly PaymentPart[], index: number, amount: number): PaymentPart[] {
  if (parts.length !== 2) return parts.map((part, position) => (position === index ? { ...part, monto: amount } : part));
  const own = Math.max(0, Math.min(amount, total));
  const other = Math.max(0, (cents(total) - cents(own)) / 100);
  return parts.map((part, position) => ({ ...part, monto: position === index ? own : other }));
}

/**
 * D4: reparte un pago entre varios cargos en orden (el primero hasta cubrirlo,
 * luego el siguiente) y, dentro de cada cargo, gasta las partes en orden.
 * Devuelve, por cargo, lo aplicado y con qué métodos. Los cargos sin nada quedan
 * con monto 0 y sin partes.
 */
export function allocatePayment(dues: readonly number[], parts: readonly PaymentPart[]): Array<{ monto: number; partes: PaymentPart[] }> {
  const pool = parts.map((part) => ({ metodo: part.metodo, left: cents(part.monto) }));
  let available = pool.reduce((sum, part) => sum + part.left, 0);

  return dues.map((due) => {
    let need = Math.min(cents(due), available);
    const applied = need;
    const partes: PaymentPart[] = [];
    for (const part of pool) {
      if (need <= 0) break;
      const take = Math.min(part.left, need);
      if (take <= 0) continue;
      part.left -= take;
      need -= take;
      const existing = partes.find((item) => item.metodo === part.metodo);
      if (existing) existing.monto += take / 100;
      else partes.push({ metodo: part.metodo, monto: take / 100 });
    }
    available -= applied;
    return { monto: applied / 100, partes };
  });
}

/** Para informes: lo que entró por cada método. Sin partes, todo va al `metodoPago` del pago. */
export function methodBreakdown(payment: { monto: number; metodoPago: string | null; partes?: readonly PaymentPart[] | null }): PaymentPart[] {
  if (payment.partes && payment.partes.length) return payment.partes.map((part) => ({ metodo: part.metodo, monto: Number(part.monto) }));
  return [{ metodo: payment.metodoPago ?? "", monto: Number(payment.monto) }];
}

/**
 * Lo que la API guarda a partir de lo que llega: `partes` si vino (1 o 2),
 * o el `metodoPago` de siempre como una sola parte. Las partes solo se guardan
 * cuando son dos (con una, el método del pago ya lo dice todo).
 */
export function resolvePaymentParts(
  total: number,
  input: { metodoPago?: string | null; partes?: readonly PaymentPart[] | null }
): { metodoPago: string; partesGuardadas: PaymentPart[]; error: string | null } {
  const parts: PaymentPart[] = input.partes?.length
    ? input.partes.map((part) => ({ metodo: part.metodo, monto: Number(part.monto) }))
    : [{ metodo: input.metodoPago ?? "", monto: total }];
  const error = paymentPartsError(total, parts);
  return { metodoPago: summaryMethod(parts), partesGuardadas: parts.length > 1 ? parts : [], error };
}
