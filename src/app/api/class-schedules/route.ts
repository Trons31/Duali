import { requireClient } from "@/lib/auth";
import { assertClassDiscipline, classScheduleInclude } from "@/lib/class-sessions";
import { created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { classScheduleCreateSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const schedules = await prisma.classSchedule.findMany({
      where: { clientId, deletedAt: null },
      include: classScheduleInclude,
      orderBy: [{ diaSemana: "asc" }, { horaInicio: "asc" }]
    });

    return ok(schedules);
  } catch (error) {
    return handleError(error);
  }
}

// Spec 005 R1: un horario por cada dia elegido.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { dias, ...body } = classScheduleCreateSchema.parse(await readBody(request));
    await assertClassDiscipline(clientId, body.disciplineId);

    const schedules = await prisma.$transaction(
      [...new Set(dias)].map((diaSemana) =>
        prisma.classSchedule.create({ data: { ...body, clientId, diaSemana }, include: classScheduleInclude })
      )
    );

    return created(schedules);
  } catch (error) {
    return handleError(error);
  }
}
