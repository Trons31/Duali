import { requireClient } from "@/lib/auth";
import { bookingInclude, serializeBooking } from "@/lib/bookings";
import { created, handleError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assignWaitlistEntry } from "@/lib/waitlist";

type Params = { params: Promise<{ id: string }> };

// Spec 015 R4: "Dar cupo" a alguien de la lista, sin importar el plazo.
export async function POST(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const booking = await assignWaitlistEntry(clientId, id);
    const full = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: bookingInclude });
    return created(serializeBooking(full));
  } catch (error) {
    return handleError(error);
  }
}
