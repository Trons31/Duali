import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { publicWaitlistUpdateSchema } from "@/lib/validations";
import { getPublicWaitlistEntry, removeWaitlistEntry } from "@/lib/waitlist";

type Params = { params: Promise<{ token: string }> };

// Spec 015 R2: el enlace privado permite ver su puesto y salir de la lista, nada mas.
export async function GET(_request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const entry = await getPublicWaitlistEntry(token);
    if (!entry) throw new ApiError(404, "No encontramos tu lugar en la lista");
    return ok(entry);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { token } = await context.params;
    publicWaitlistUpdateSchema.parse(await readBody(request));
    if (!(await getPublicWaitlistEntry(token))) throw new ApiError(404, "No encontramos tu lugar en la lista");
    await removeWaitlistEntry({ accessToken: token });
    return ok(await getPublicWaitlistEntry(token));
  } catch (error) {
    return handleError(error);
  }
}
