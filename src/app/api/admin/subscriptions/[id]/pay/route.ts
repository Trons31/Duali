import { requireAdminApi } from "@/lib/admin-auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { markSubscriptionPaid, serializeSubscription } from "@/lib/subscriptions";
import { subscriptionPaymentSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Params) {
  try {
    await requireAdminApi();
    const { id } = await context.params;
    const body = subscriptionPaymentSchema.parse(await readBody(request));

    const result = await markSubscriptionPaid({
      subscriptionId: id,
      paymentMethod: body.paymentMethod,
      notes: body.notes,
      paidAt: body.paidAt
    });

    if (!result) {
      throw new ApiError(404, "Suscripción no encontrada");
    }

    return ok({
      payment: {
        id: result.payment.id,
        amount: Number(result.payment.amount),
        periodStart: result.payment.periodStart.toISOString(),
        periodEnd: result.payment.periodEnd.toISOString(),
        paidAt: result.payment.paidAt.toISOString(),
        paymentMethod: result.payment.paymentMethod,
        notes: result.payment.notes
      },
      subscription: serializeSubscription(result.subscription)
    });
  } catch (error) {
    return handleError(error);
  }
}
