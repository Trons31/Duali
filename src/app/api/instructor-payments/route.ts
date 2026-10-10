import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { getInstructorPayments } from "@/lib/instructor-ledger";

// Spec 023 R7/R9: ciclos de pago de los instructores, materializados al consultar.
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await getInstructorPayments(clientId));
  } catch (error) {
    return handleError(error);
  }
}
