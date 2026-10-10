import { ApiError, handleError, ok } from "@/lib/http";
import { getPublicPlan } from "@/lib/online-plans";

type Params = { params: Promise<{ token: string }> };

// Spec 021 R8: Mi plan, con el enlace privado.
export async function GET(_request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const plan = await getPublicPlan(token);
    if (!plan) throw new ApiError(404, "Plan no encontrado");
    return ok(plan);
  } catch (error) {
    return handleError(error);
  }
}
