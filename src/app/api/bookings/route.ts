import { requireClient } from "@/lib/auth";
import { bookingInclude, createBooking, serializeBooking } from "@/lib/bookings";
import { created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { dateKeyToDate, studioTodayKey } from "@/lib/studio-time";
import { bookingCreateSchema, bookingsQuerySchema } from "@/lib/validations";

// GET ?scheduleId&fecha → reservados de una clase (incluye canceladas, para la historia).
// GET ?memberId        → proximas reservas de un cliente.
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = bookingsQuerySchema.parse(params);

    const bookings = await prisma.booking.findMany({
      where:
        "memberId" in query
          ? {
              clientId,
              memberId: query.memberId,
              estado: { not: "CANCELADA" },
              session: { fecha: { gte: dateKeyToDate(studioTodayKey()) } }
            }
          : {
              clientId,
              session: { scheduleId: query.scheduleId, fecha: dateKeyToDate(query.fecha) }
            },
      include: bookingInclude,
      orderBy: [{ session: { fecha: "asc" } }, { session: { horaInicio: "asc" } }, { createdAt: "asc" }]
    });

    return ok(bookings.map(serializeBooking));
  } catch (error) {
    return handleError(error);
  }
}

// Spec 007 R1.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = bookingCreateSchema.parse(await readBody(request));
    const booking = await createBooking({ ...body, clientId, origen: "PANEL" });
    const full = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: bookingInclude });
    return created(serializeBooking(full));
  } catch (error) {
    return handleError(error);
  }
}
