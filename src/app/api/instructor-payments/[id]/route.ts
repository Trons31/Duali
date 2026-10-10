import { requireClient } from "@/lib/auth";
import { handleError, ok, readBody } from "@/lib/http";
import { getPaymentDetail, voidInstructorPayment } from "@/lib/instructor-payments";
import { instructorPaymentVoidSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

// Spec 023 R13: detalle de un pago con la fotografia de sus ciclos.
export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    return ok(await getPaymentDetail(clientId, id));
  } catch (error) {
    return handleError(error);
  }
}

// Anular: deshace lo aplicado a cada ciclo y su egreso (D8).
export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const { motivo } = instructorPaymentVoidSchema.parse(await readBody(request));
    return ok(await voidInstructorPayment(clientId, id, motivo));
  } catch (error) {
    return handleError(error);
  }
}
