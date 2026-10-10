import { created, handleError, readBody } from "@/lib/http";
import { renewPublicPlan } from "@/lib/online-plans";
import { publicPlanRenewSchema } from "@/lib/validations";

type Params = { params: Promise<{ token: string }> };

// Spec 020 R13: renovar desde Mi plan, con el pago como en la compra en linea.
export async function POST(request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const body = publicPlanRenewSchema.parse(await readBody(request));
    return created(await renewPublicPlan(token, body.pago));
  } catch (error) {
    return handleError(error);
  }
}
