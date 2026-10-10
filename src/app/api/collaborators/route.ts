import { requireClient } from "@/lib/auth";
import { createCollaborator, listCollaborators } from "@/lib/collaborators";
import { created, handleError, ok, readBody } from "@/lib/http";
import { collaboratorSchema } from "@/lib/validations";

// Spec 024 R3: administradores y socios. Solo la dueña (fuera del mapa de permisos).
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await listCollaborators(clientId));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = collaboratorSchema.parse(await readBody(request));
    return created(await createCollaborator(clientId, body));
  } catch (error) {
    return handleError(error);
  }
}
