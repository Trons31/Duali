import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const exists = await prisma.notification.findFirst({ where: { id, clientId } });
    if (!exists) throw new ApiError(404, "Notificación no encontrada");

    const notification = await prisma.notification.update({
      where: { id },
      data: { status: "LEIDA", readAt: new Date() }
    });

    return ok(notification);
  } catch (error) {
    return handleError(error);
  }
}
