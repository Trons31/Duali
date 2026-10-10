import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { listPaymentHistory } from "@/lib/instructor-payments";

// Spec 023 R13: historial de pagos agrupado por ciclo.
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await listPaymentHistory(clientId));
  } catch (error) {
    return handleError(error);
  }
}
