import { handleError, ok } from "@/lib/http";
import { signReceiptUpload } from "@/lib/receipts";

type Params = { params: Promise<{ token: string }> };

// Spec 014 R1: firma para subir el comprobante, solo con el enlace privado de la reserva.
export async function POST(_request: Request, context: Params) {
  try {
    const { token } = await context.params;
    return ok(await signReceiptUpload(token));
  } catch (error) {
    return handleError(error);
  }
}
