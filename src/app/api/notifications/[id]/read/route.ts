import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { markNotificationsRead } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const exists = await prisma.notification.findFirst({ where: { id, clientId } });
    if (!exists) throw new ApiError(404, "Notificación no encontrada");

    await markNotificationsRead(clientId, { notificationIds: [id] });
    const notification = await prisma.notification.findUnique({ where: { id } });

    return ok(notification);
  } catch (error) {
    return handleError(error);
  }
}
