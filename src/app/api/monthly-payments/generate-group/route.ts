import { requireClient } from "@/lib/auth";
import { paymentStatusForDueDate } from "@/lib/dates";
import { ApiError, created, handleError, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { generateMonthlyByGroupSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = generateMonthlyByGroupSchema.parse(await readBody(request));
    const group = await prisma.group.findFirst({ where: { id: body.groupId, clientId, deletedAt: null } });
    if (!group) throw new ApiError(404, "Grupo no encontrado");

    const students = await prisma.student.findMany({
      where: { clientId, grupoId: body.groupId, estado: "ACTIVO", deletedAt: null }
    });

    const result = await prisma.monthlyPayment.createMany({
      data: students.map((student) => {
        const amount = body.monto ?? Number(student.precioMensualidad ?? group.precioMensualidadDefault);

        return {
          estudianteId: student.id,
          grupoId: group.id,
          clientId,
          mes: body.mes,
          anio: body.anio,
          monto: amount,
          saldoPendiente: amount,
          fechaVencimiento: body.fechaVencimiento,
          estado: paymentStatusForDueDate(body.fechaVencimiento)
        };
      }),
      skipDuplicates: true
    });

    return created({ created: result.count });
  } catch (error) {
    return handleError(error);
  }
}
