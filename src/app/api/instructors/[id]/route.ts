import { requireClient } from "@/lib/auth";
import { handleError, ok, readBody } from "@/lib/http";
import { getInstructor, removeInstructor, saveInstructor } from "@/lib/instructors";
import { instructorSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    return ok(await getInstructor(clientId, id));
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = instructorSchema.parse(await readBody(request));
    return ok(await saveInstructor(clientId, body, id));
  } catch (error) {
    return handleError(error);
  }
}

// Spec 023 R1: con horarios o clases dictadas se desactiva; si no, se borra.
export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    return ok(await removeInstructor(clientId, id));
  } catch (error) {
    return handleError(error);
  }
}
