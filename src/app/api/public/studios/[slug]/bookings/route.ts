import { created, handleError, ok, readBody } from "@/lib/http";
import { createPublicBooking } from "@/lib/public-studio";
import { publicBookingSchema } from "@/lib/validations";

type Params = { params: Promise<{ slug: string }> };

// Spec 009 R1: reserva desde la pagina publica, sin sesion.
export async function POST(request: Request, context: Params) {
  try {
    const { slug } = await context.params;
    const body = publicBookingSchema.parse(await readBody(request));
    const result = await createPublicBooking(slug, body);
    return result.estado === "RESERVADA" ? created(result) : ok(result);
  } catch (error) {
    return handleError(error);
  }
}
