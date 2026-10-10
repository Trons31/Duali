import { requireClient } from "@/lib/auth";
import { handleError, noContent } from "@/lib/http";
import { removeWaitlistEntry } from "@/lib/waitlist";

type Params = { params: Promise<{ id: string }> };

// Spec 015 R4: quitar a alguien de la lista de espera.
export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    await removeWaitlistEntry({ id, clientId });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
