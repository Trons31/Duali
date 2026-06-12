import { requireClient } from "@/lib/auth";
import { handleError, ok, readBody } from "@/lib/http";
import { deleteMonthlyPaymentInstallment, updateMonthlyPaymentInstallment } from "@/lib/payment-installments";
import { paymentInstallmentSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string; installmentId: string }> };

export async function PATCH(request: Request, context: Params) {
  try {
    const { id, installmentId } = await context.params;
    const { clientId } = await requireClient(request);
    const body = paymentInstallmentSchema.pick({
      monto: true,
      metodoPago: true,
      fechaAbono: true
    }).parse(await readBody(request));

    return ok(
      await updateMonthlyPaymentInstallment(clientId, id, installmentId, {
        monto: body.monto,
        metodoPago: body.metodoPago,
        fechaAbono: body.fechaAbono
      })
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id, installmentId } = await context.params;
    const { clientId } = await requireClient(request);
    return ok(await deleteMonthlyPaymentInstallment(clientId, id, installmentId));
  } catch (error) {
    return handleError(error);
  }
}
