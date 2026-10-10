import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { isDateKey } from "@/lib/studio-time";
import { getCancelledClassReminders, getStudioReminders } from "@/lib/studio-reminders";
import { getAppBaseUrl } from "@/lib/web-utils";

// Spec 011 R4/R5. GET → avisos del dia; ?scheduleId&fecha → avisos de una clase cancelada.
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const baseUrl = getAppBaseUrl(request.headers.get("host"), request.headers.get("x-forwarded-proto"));
    const scheduleId = url.searchParams.get("scheduleId");
    const fecha = url.searchParams.get("fecha");

    if (scheduleId && fecha && isDateKey(fecha)) {
      return ok(await getCancelledClassReminders(clientId, scheduleId, fecha, { baseUrl }));
    }
    return ok(await getStudioReminders(clientId, { baseUrl }));
  } catch (error) {
    return handleError(error);
  }
}
