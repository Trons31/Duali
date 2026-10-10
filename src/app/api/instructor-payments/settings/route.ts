import { requireClient } from "@/lib/auth";
import { handleError, ok, readBody } from "@/lib/http";
import { getPaySettings, savePaySettings } from "@/lib/instructor-ledger";
import { instructorPaySettingsSchema } from "@/lib/validations";

// Spec 023 R6: ciclo de pago del estudio (null = aun sin configurar).
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await getPaySettings(clientId));
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = instructorPaySettingsSchema.parse(await readBody(request));
    return ok(await savePaySettings(clientId, body));
  } catch (error) {
    return handleError(error);
  }
}
