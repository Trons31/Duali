import { requireCronSecret } from "@/lib/cron";
import { handleError, ok } from "@/lib/http";
import { getNotificationBatchLimit, processNotificationQueue } from "@/lib/notification-queue";

// Sin tope esta ruta heredaba el maximo del plan: un envio colgado la dejaba
// encendida minutos (timeouts en Observability) y cada corrida facturaba esa
// espera. La cola ya trabaja con un presupuesto de 40s (CRON_TIME_BUDGET_MS),
// asi que 60s solo corta lo que de verdad quedo colgado.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
