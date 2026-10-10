import { STUDIO_PAYMENT_METHODS } from "@/lib/validations";

// Pagos de lo que se compra desde la pagina publica (spec 021). Funciones puras:
// las usan el servidor, la pagina publica y el panel.

/** Spec 021 D7: compras en linea sin pago aprobado que puede tener un celular. */
export const MAX_PENDING_ONLINE_PURCHASES = 2;

/** Spec 021 R2: como CliqCut, hasta 4 MB por foto (el navegador la reduce antes). */
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Spec 021 D2: el comprobante (foto como data URL) o pagar en el estudio. */
export type OnlinePayment = { tipo: "COMPROBANTE"; comprobante: string; metodo: string } | { tipo: "EN_ESTUDIO" };

export type PaymentState = "PAGADO" | "EN_REVISION" | "RECHAZADO" | "PAGO_EN_ESTUDIO" | "DEBE";

type ReceiptLike = { estado: "POR_REVISAR" | "APROBADO" | "RECHAZADO"; createdAt: Date | string };

/** Spec 021, tabla "Estados del pago". `receipts` en cualquier orden. */
export function paymentState(sale: { saldo: number; origen: "PANEL" | "PUBLICO"; receipts: ReceiptLike[] }): PaymentState {
  if (sale.saldo <= 0) return "PAGADO";
  if (sale.receipts.some((receipt) => receipt.estado === "POR_REVISAR")) return "EN_REVISION";
  const latest = [...sale.receipts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  if (latest?.estado === "RECHAZADO") return "RECHAZADO";
  if (sale.origen === "PUBLICO" && !sale.receipts.length) return "PAGO_EN_ESTUDIO";
  return "DEBE";
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  PAGADO: "Pagado",
  EN_REVISION: "Pago en revisión",
  RECHAZADO: "Comprobante rechazado",
  PAGO_EN_ESTUDIO: "Paga en el estudio",
  DEBE: "Por pagar"
};

/**
 * La foto llega como data URL (spec 021 R4). Devuelve el problema para mostrarlo
 * tal cual, o null si sirve.
 */
export function receiptDataUrlProblem(dataUrl: string): string | null {
  const match = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return "El comprobante no es una imagen válida";
  if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(match[1])) return "Solo se aceptan fotos JPG, PNG o WebP";
  const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
  const bytes = (match[2].length * 3) / 4 - padding;
  if (bytes > MAX_RECEIPT_BYTES) return "La foto pesa más de 4 MB";
  if (bytes < 100) return "El comprobante no es una imagen válida";
  return null;
}

/**
 * El nombre del metodo del estudio ("Nequi", "Bancolombia ahorros") al metodo
 * del registro de pago, para dejarlo elegido al aprobar (spec 021 R11).
 */
export function paymentMethodFromName(name: string | null | undefined): (typeof STUDIO_PAYMENT_METHODS)[number] {
  const text = (name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (!text) return "TRANSFERENCIA";
  if (text.includes("EFECTIVO") || text.includes("ESTUDIO")) return "EFECTIVO";
  if (text.includes("NEQUI")) return "NEQUI";
  if (text.includes("BANCOLOMBIA")) return "BANCOLOMBIA";
  return "TRANSFERENCIA";
}
