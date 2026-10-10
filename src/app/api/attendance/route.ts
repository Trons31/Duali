import { requireClient } from "@/lib/auth";
import { getAttendanceDay, getPendingAttendance } from "@/lib/attendance";
import { ApiError, handleError, ok } from "@/lib/http";
import { isDateKey, studioTodayKey } from "@/lib/studio-time";

// Spec 019 R7/R10: ?fecha=YYYY-MM-DD → clases del dia con su lista; ?pendientes=1 → clases sin marcar.
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    if (url.searchParams.get("pendientes") === "1") return ok(await getPendingAttendance(clientId));
    const fecha = url.searchParams.get("fecha") ?? studioTodayKey();
    if (!isDateKey(fecha)) throw new ApiError(422, "Fecha inválida");
    return ok(await getAttendanceDay(clientId, fecha));
  } catch (error) {
    return handleError(error);
  }
}
