import { requireClient } from "@/lib/auth";
import { setCollaboratorActive, updateCollaborator } from "@/lib/collaborators";
import { handleError, ok, readBody } from "@/lib/http";
import { collaboratorSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = collaboratorSchema.parse(await readBody(request));
    return ok(await updateCollaborator(clientId, id, body));
  } catch (error) {
    return handleError(error);
  }
}

// Spec 024 R7: no se borra, se desactiva (y se puede reactivar con PUT activo).
export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    return ok(await setCollaboratorActive(clientId, id, false));
  } catch (error) {
    return handleError(error);
  }
}
