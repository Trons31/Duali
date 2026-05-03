import { requireCronSecret } from "@/lib/cron";
import { handleError, ok } from "@/lib/http";
import { getNotificationBatchLimit, processNotificationQueue } from "@/lib/notification-queue";

export async function GET(request: Request) {
  try {
    requireCronSecret(request);
    const queue = await processNotificationQueue(getNotificationBatchLimit(request));

    return ok({
      queue,
      scheduleHint:
        "Programa este endpoint en cron-job.org con GET si quieres drenar la cola separado de la creacion de recordatorios."
    });
  } catch (error) {
    return handleError(error);
  }
}

export const POST = GET;
