import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { importScheduleInstructors, unregisteredScheduleNames } from "@/lib/instructors";

// Spec 023 R3: instructores escritos a mano en el horario.
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await unregisteredScheduleNames(clientId));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await importScheduleInstructors(clientId));
  } catch (error) {
    return handleError(error);
  }
}
