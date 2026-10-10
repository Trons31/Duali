import { ApiError, created, handleError, readBody } from "@/lib/http";
import { createOnlinePlanPurchase } from "@/lib/online-plans";
import { ensurePublicMember, getPublishedStudio } from "@/lib/public-studio";
import { publicPlanPurchaseSchema } from "@/lib/validations";

type Params = { params: Promise<{ slug: string }> };

// Spec 021 R3: comprar un plan desde la pagina publica, sin sesion.
export async function POST(request: Request, context: Params) {
  try {
    const { slug } = await context.params;
    const body = publicPlanPurchaseSchema.parse(await readBody(request));
    const studio = await getPublishedStudio(slug);
    if (!studio) throw new ApiError(404, "Estudio no encontrado");
    const result = await createOnlinePlanPurchase(studio, body, (celular, member) => ensurePublicMember(studio.id, celular, body, member));
    return created(result);
  } catch (error) {
    return handleError(error);
  }
}
