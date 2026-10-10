import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { waitlistQuerySchema } from "@/lib/validations";
import { listSessionWaitlist } from "@/lib/waitlist";

// Spec 015 R4: lista de espera de una clase (?scheduleId&fecha).
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { scheduleId, fecha } = waitlistQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return ok(await listSessionWaitlist(clientId, scheduleId, fecha));
  } catch (error) {
    return handleError(error);
  }
}
