import { requireClient } from "@/lib/auth";
import { cancelSessionBookings, countActiveBookings, lockSession } from "@/lib/bookings";
import { ensureClassSession, listClassSessions } from "@/lib/class-sessions";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { assertAssignableInstructor } from "@/lib/instructors";
import { prisma } from "@/lib/prisma";
import { daysBetweenKeys } from "@/lib/studio-time";
import { classSessionUpdateSchema, classSessionsQuerySchema } from "@/lib/validations";
import { fillFromWaitlist } from "@/lib/waitlist";

const MAX_RANGE_DAYS = 42;

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const { from, to } = classSessionsQuerySchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to")
    });
    if (daysBetweenKeys(from, to) > MAX_RANGE_DAYS) {
      throw new ApiError(422, `El rango máximo es de ${MAX_RANGE_DAYS} días`);
    }

    return ok(await listClassSessions(clientId, from, to));
  } catch (error) {
    return handleError(error);
  }
}

// Spec 005 R4: ajustes de una sola fecha (cupo, cancelar, reactivar).
export async function PUT(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { scheduleId, fecha, cupo, cancelada, motivoCancelacion, instructorId } = classSessionUpdateSchema.parse(
      await readBody(request)
    );
    if (instructorId) await assertAssignableInstructor(clientId, instructorId);

    const session = await prisma.$transaction(async (tx) => {
      const current = await ensureClassSession(clientId, scheduleId, fecha, tx);
      await lockSession(tx, current.id);

      if (cupo !== undefined) {
        const booked = await countActiveBookings(tx, current.id);
        if (cupo < booked) throw new ApiError(409, `Ya hay ${booked} reservas; el cupo no puede ser menor`);
      }
      // Spec 007 R4: cancelar la clase cancela sus reservas y devuelve la clase a todas.
      if (cancelada === true && !current.cancelada) await cancelSessionBookings(tx, current.id);

      // Spec 023 D5: el reemplazo; elegir al titular es lo mismo que no tener reemplazo.
      const titular = instructorId !== undefined ? (await tx.classSchedule.findUniqueOrThrow({ where: { id: scheduleId }, select: { instructorId: true } })).instructorId : null;
      return tx.classSession.update({
        where: { id: current.id },
        data: {
          ...(instructorId !== undefined ? { instructorId: instructorId && instructorId !== titular ? instructorId : null } : {}),
          ...(cupo !== undefined ? { cupo } : {}),
          ...(cancelada !== undefined
            ? { cancelada, motivoCancelacion: cancelada ? (motivoCancelacion ?? null) : null }
            : {})
        }
      });
    });

    // Spec 015 R3: mas cupo o la clase reactivada dejan entrar a la lista de espera.
    if (!session.cancelada) await fillFromWaitlist(session.id);
    return ok(session);
  } catch (error) {
    return handleError(error);
  }
}
