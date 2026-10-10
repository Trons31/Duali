import { requireClient } from "@/lib/auth";
import { created, handleError, readBody } from "@/lib/http";
import { payInstructor } from "@/lib/instructor-payments";
import { instructorPaySchema } from "@/lib/validations";

// Spec 023 R11: pagar a un instructor (total o parcial, en una o dos formas).
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = instructorPaySchema.parse(await readBody(request));
    return created(await payInstructor(clientId, body));
  } catch (error) {
    return handleError(error);
  }
}
