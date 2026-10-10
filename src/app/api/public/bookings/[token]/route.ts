import { cancelBooking } from "@/lib/bookings";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getPublicBooking } from "@/lib/public-studio";
import { notifyPublicCancellation } from "@/lib/studio-notifications";
import { publicBookingUpdateSchema } from "@/lib/validations";
import { fillFromWaitlist } from "@/lib/waitlist";

type Params = { params: Promise<{ token: string }> };

// Spec 009 R2: el enlace privado permite ver y cancelar esa reserva, nada mas.
export async function GET(_request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const booking = await getPublicBooking(token);
    if (!booking) throw new ApiError(404, "Reserva no encontrada");
    return ok(booking);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { token } = await context.params;
    publicBookingUpdateSchema.parse(await readBody(request));
    const booking = await prisma.booking.findUnique({ where: { accessToken: token }, select: { id: true, clientId: true, sessionId: true } });
    if (!booking) throw new ApiError(404, "Reserva no encontrada");

    // Sin excepcion manual: la clase solo se devuelve dentro del plazo del estudio.
    const result = await cancelBooking({ clientId: booking.clientId, bookingId: booking.id });
    await notifyPublicCancellation(booking.id);
    // Spec 015 R3: el cupo liberado pasa a la lista de espera.
    await fillFromWaitlist(booking.sessionId);
    return ok({ ...(await getPublicBooking(token)), claseDevuelta: result.claseDevuelta });
  } catch (error) {
    return handleError(error);
  }
}
