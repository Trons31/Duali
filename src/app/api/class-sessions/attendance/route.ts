import { requireClient } from "@/lib/auth";
import { markAllAttended } from "@/lib/attendance";
import { handleError, ok, readBody } from "@/lib/http";
import { attendanceAllSchema } from "@/lib/validations";

// Spec 019 R7: "Todos asistieron" en una clase.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { scheduleId, fecha } = attendanceAllSchema.parse(await readBody(request));
    return ok(await markAllAttended(clientId, scheduleId, fecha));
  } catch (error) {
    return handleError(error);
  }
}
