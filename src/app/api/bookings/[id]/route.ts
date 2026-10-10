import { requireClient } from "@/lib/auth";
import { bookingInclude, cancelBooking, serializeBooking } from "@/lib/bookings";
import { handleError, ok, readBody } from "@/lib/http";
import { setAttendance } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { bookingUpdateSchema } from "@/lib/validations";
import { fillFromWaitlist } from "@/lib/waitlist";

type Params = { params: Promise<{ id: string }> };

// Spec 007 R2 (cancelar) y R3 (asistencia).
export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = bookingUpdateSchema.parse(await readBody(request));

    if ("cancelar" in body) {
      const result = await cancelBooking({ clientId, bookingId: id, devolverClase: body.devolverClase });
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude });
      // Spec 015 R3: el cupo liberado pasa a la lista de espera.
      await fillFromWaitlist(booking.sessionId);
      return ok({ ...serializeBooking(booking), claseDevuelta: result.claseDevuelta });
    }

    // Spec 019: la clase ya se desconto al reservar; la politica de inasistencia
    // puede devolverla (y desmarcar la vuelve a descontar).
    const result = await setAttendance(clientId, id, body.estado);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude });
    return ok({ ...serializeBooking(booking), devuelta: result.devuelta });
  } catch (error) {
    return handleError(error);
  }
}
