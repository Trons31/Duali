import { requireClient } from "@/lib/auth";
import { created, handleError, ok, readBody } from "@/lib/http";
import { listInstructors, saveInstructor } from "@/lib/instructors";
import { instructorSchema } from "@/lib/validations";

// Spec 023 R1: instructores del estudio.
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await listInstructors(clientId));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = instructorSchema.parse(await readBody(request));
    return created(await saveInstructor(clientId, body));
  } catch (error) {
    return handleError(error);
  }
}
