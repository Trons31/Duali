import { requireClient } from "@/lib/auth";
import { getMemberClassHistory } from "@/lib/attendance";
import { handleError, ok } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

// Spec 019 R9: las clases de un cliente (reservadas, asistidas, faltas y canceladas).
export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    return ok(await getMemberClassHistory(clientId, id));
  } catch (error) {
    return handleError(error);
  }
}
