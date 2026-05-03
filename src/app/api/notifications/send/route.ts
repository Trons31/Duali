import { requireClient } from "@/lib/auth";
import { created, handleError, readBody } from "@/lib/http";
import { processNotificationQueue, queueNotification } from "@/lib/notification-queue";
import { sendNotificationSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = sendNotificationSchema.parse(await readBody(request));

    const queued = await queueNotification({
      clientId,
      type: "MANUAL",
      title: body.title,
      body: body.body,
      data: body.data ?? {}
    });
    const queue = await processNotificationQueue(1);

    return created({ ...queued, queue });
  } catch (error) {
    return handleError(error);
  }
}
