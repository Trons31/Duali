import { requireClient } from "@/lib/auth";
import { created, handleError, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { sendExpoPushNotifications } from "@/lib/push";
import { sendNotificationSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = sendNotificationSchema.parse(await readBody(request));

    const tokens = await prisma.pushToken.findMany({ where: { clientId, isActive: true } });
    const notification = await prisma.notification.create({
      data: { clientId, title: body.title, body: body.body, data: body.data ?? {}, status: "PENDIENTE" }
    });

    try {
      await sendExpoPushNotifications(tokens.map((item) => item.token), body.title, body.body, body.data);
      const sent = await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "ENVIADA", sentAt: new Date() }
      });
      return created(sent);
    } catch (error) {
      const failed = await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "FALLIDA", error: error instanceof Error ? error.message : "Error desconocido" }
      });
      return created(failed);
    }
  } catch (error) {
    return handleError(error);
  }
}
