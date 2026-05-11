import { requireClient } from "@/lib/auth";
import { handleError, ok, readBody } from "@/lib/http";
import { getPaymentInstallments, registerPaymentInstallment } from "@/lib/payment-installments";
import { paymentInstallmentSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const installments = await getPaymentInstallments(clientId, id, "MONTHLY_PAYMENT");

    return ok(installments);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId, safeClient } = await requireClient(request);
    const body = paymentInstallmentSchema.parse(await readBody(request));
    const result = await registerPaymentInstallment({
      clientId,
      paymentId: id,
      kind: "MONTHLY_PAYMENT",
      monto: body.monto,
      metodoPago: body.metodoPago,
      fechaAbono: body.fechaAbono,
      notas: body.notas,
      registeredByUserId: safeClient.id,
      registeredByName: safeClient.nombre
    });

    return ok(result, 201);
  } catch (error) {
    return handleError(error);
  }
}
