import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureClientSubscription, serializeSubscription } from "@/lib/subscriptions";

const CONFIRMATION_WORD = "CANCELAR";

export async function POST(request: Request) {
  try {
    const { client } = await requireClient(request);
    const body = await readBody<{ confirmation?: string }>(request);

    // Segunda barrera en el servidor: el cliente ya escribio la palabra, pero
    // no confiamos solo en la validacion del navegador para una accion que
    // bloquea el acceso de todo el negocio.
    if (body.confirmation?.trim().toUpperCase() !== CONFIRMATION_WORD) {
      throw new ApiError(422, `Debes escribir ${CONFIRMATION_WORD} para confirmar`);
    }

    const subscription = await ensureClientSubscription(client.id);

    if (subscription.status === "CANCELADA") {
      throw new ApiError(409, "La suscripción ya está cancelada");
    }

    const cancelled = await prisma.clientSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "CANCELADA",
        notes: `Cancelada por el cliente el ${new Date().toISOString()}`
      },
      include: { plan: true, payments: { orderBy: { paidAt: "desc" } } }
    });

    return ok({ subscription: serializeSubscription(cancelled) });
  } catch (error) {
    return handleError(error);
  }
}
