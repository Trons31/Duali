import { queueAdminPaymentReminders } from "@/lib/admin-reminders";
import { getNotificationBatchLimit, newDeadline, processNotificationQueue } from "@/lib/notification-queue";
import { requireCronSecret } from "@/lib/cron";
import { handleError, ok } from "@/lib/http";

// Corta el dano: antes estas funciones morian a los 300s (504) y, al dispararse
// el cron cada minuto, se acumulaban hasta 5 instancias concurrentes.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireCronSecret(request);

    const { searchParams } = new URL(request.url);
    const processParam = searchParams.get("process");
    const shouldProcessQueue = processParam === null || processParam === "1" || processParam === "true";
    // Un unico presupuesto de tiempo compartido por las dos fases: la funcion
    // devuelve lo que alcanzo a hacer en vez de expirar a los 300s.
    const deadline = newDeadline();
    const reminders = await queueAdminPaymentReminders({ deadline });
    const queue = shouldProcessQueue
      ? await processNotificationQueue(getNotificationBatchLimit(request), { deadline })
      : null;

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
