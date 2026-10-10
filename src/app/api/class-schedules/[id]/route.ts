import { requireClient } from "@/lib/auth";
import { countFutureActiveBookings } from "@/lib/bookings";
import { assertClassDiscipline, classScheduleInclude } from "@/lib/class-sessions";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { scheduleInstructorData } from "@/lib/instructors";
import { prisma } from "@/lib/prisma";
import { classScheduleUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

async function findSchedule(clientId: string, id: string) {
  const schedule = await prisma.classSchedule.findFirst({ where: { id, clientId, deletedAt: null } });
  if (!schedule) throw new ApiError(404, "Horario no encontrado");
  return schedule;
}

// Los cambios aplican a las fechas que aun no tienen datos propios; las clases ya
// guardadas conservan su hora y cupo (spec 005).
export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    await findSchedule(clientId, id);
    const body = classScheduleUpdateSchema.parse(await readBody(request));
    if (body.disciplineId) await assertClassDiscipline(clientId, body.disciplineId);

    const data = { ...body, ...(await scheduleInstructorData(clientId, body)) };
    const schedule = await prisma.classSchedule.update({ where: { id }, data, include: classScheduleInclude });
    return ok(schedule);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    await findSchedule(clientId, id);
    const upcoming = await countFutureActiveBookings({ clientId, session: { scheduleId: id } });
    if (upcoming) {
      throw new ApiError(409, `Tiene ${upcoming} reserva${upcoming === 1 ? "" : "s"} próximas. Cancélalas o pausa el horario.`);
    }
    // Borrado logico: las clases ya guardadas de este horario conservan su historia.
    await prisma.classSchedule.update({ where: { id }, data: { deletedAt: new Date(), activo: false } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
