import { created, handleError, readBody } from "@/lib/http";
import { attachPlanReceipt } from "@/lib/online-plans";
import { publicPlanReceiptSchema } from "@/lib/validations";

type Params = { params: Promise<{ token: string }> };

// Spec 021 R8: otro comprobante desde Mi plan.
export async function POST(request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const body = publicPlanReceiptSchema.parse(await readBody(request));
    return created(await attachPlanReceipt(token, body));
  } catch (error) {
    return handleError(error);
  }
}
