import { queueAdminPaymentReminders } from "@/lib/admin-reminders";
import { getNotificationBatchLimit, processNotificationQueue } from "@/lib/notification-queue";
import { requireCronSecret } from "@/lib/cron";
import { handleError, ok } from "@/lib/http";

export async function GET(request: Request) {
  try {
    requireCronSecret(request);

    const { searchParams } = new URL(request.url);
    const processParam = searchParams.get("process");
    const shouldProcessQueue = processParam === null || processParam === "1" || processParam === "true";
    const reminders = await queueAdminPaymentReminders();
    const queue = shouldProcessQueue ? await processNotificationQueue(getNotificationBatchLimit(request)) : null;

    return ok({
      reminders,
      queue,
      scheduleHint:
        "Programa este endpoint en cron-job.org con GET. Usa ?process=true&limit=100 y agrega ?secret=CRON_SECRET si configuraste CRON_SECRET."
    });
  } catch (error) {
    return handleError(error);
  }
}

export const POST = GET;
