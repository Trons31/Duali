import { requireClient } from "@/lib/auth";
import { created, handleError, noContent, ok, readBody } from "@/lib/http";
import { processNotificationQueue, requeuePushNotificationsForClient } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { deleteWebPushSubscriptionSchema, webPushSubscriptionSchema } from "@/lib/validations";
import { getWebPushPublicKey } from "@/lib/web-push";

export async function GET(request: Request) {
  try {
    await requireClient(request);
    const publicKey = await getWebPushPublicKey();
    return ok({ publicKey });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = webPushSubscriptionSchema.parse(await readBody(request));

    const subscription = await prisma.webPushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: {
        clientId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        expirationTime: body.expirationTime != null ? BigInt(body.expirationTime) : null,
        userAgent: body.userAgent,
        deviceName: body.deviceName,
        isActive: true,
        lastUsedAt: new Date()
      },
      create: {
        clientId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        expirationTime: body.expirationTime != null ? BigInt(body.expirationTime) : null,
        userAgent: body.userAgent,
        deviceName: body.deviceName
      }
    });

    const requeue = await requeuePushNotificationsForClient(clientId, { limit: 25 });
    const queue = await processNotificationQueue(25);

    return created({ subscription, requeue, queue });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = deleteWebPushSubscriptionSchema.parse(await readBody(request));

    await prisma.webPushSubscription.updateMany({
      where: {
        clientId,
        endpoint: body.endpoint
      },
      data: {
        isActive: false
      }
    });

    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
