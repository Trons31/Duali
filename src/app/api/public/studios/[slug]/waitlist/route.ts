import { created, handleError, ok, readBody } from "@/lib/http";
import { publicBookingSchema } from "@/lib/validations";
import { joinWaitlist } from "@/lib/waitlist";

type Params = { params: Promise<{ slug: string }> };

// Spec 015 R1: anotarse en la lista de espera de una clase llena, sin sesion.
export async function POST(request: Request, context: Params) {
  try {
    const { slug } = await context.params;
    const body = publicBookingSchema.parse(await readBody(request));
    const result = await joinWaitlist(slug, body);
    return result.estado === "EN_ESPERA" ? created(result) : ok(result);
  } catch (error) {
    return handleError(error);
  }
}
