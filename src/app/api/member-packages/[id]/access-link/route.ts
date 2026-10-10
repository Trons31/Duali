import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { ensurePlanAccessToken } from "@/lib/online-plans";
import { prisma } from "@/lib/prisma";
import { myPlanHref } from "@/lib/public-presentation";

type Params = { params: Promise<{ id: string }> };

// Spec 021 R10: el enlace Mi plan de una venta, para enviarlo por WhatsApp.
export async function POST(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const accessToken = await ensurePlanAccessToken(clientId, id);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true, paginaPublicaActiva: true } });
    if (!client.slug || !client.paginaPublicaActiva) throw new ApiError(409, "Publica tu página para enviar el enlace de Mi plan");
    return ok({ accessToken, path: myPlanHref(client.slug, accessToken) });
  } catch (error) {
    return handleError(error);
  }
}
