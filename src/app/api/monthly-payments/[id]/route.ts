import { requireClient } from "@/lib/auth";
import { paymentStatusForDueDate } from "@/lib/dates";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { monthlyPaymentUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const payment = await prisma.monthlyPayment.findFirst({
      where: { id, clientId, deletedAt: null },
      include: { student: true, group: true, reminders: true }
    });
    if (!payment) throw new ApiError(404, "Mensualidad no encontrada");
    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = monthlyPaymentUpdateSchema.parse(await readBody(request));
    const exists = await prisma.monthlyPayment.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Mensualidad no encontrada");
    if (body.estado === "NO_APLICA" && Number(exists.montoAbonado) > 0) {
      throw new ApiError(409, "No se puede marcar como No aplica una mensualidad con abonos registrados");
    }
    if (exists.estado === "NO_APLICA" && body.estado !== undefined && body.estado !== "NO_APLICA") {
      throw new ApiError(409, "Esta mensualidad esta marcada como No aplica");
    }

    let grupoId = exists.grupoId;
    if (body.estudianteId && body.estudianteId !== exists.estudianteId) {
      const student = await prisma.student.findFirst({ where: { id: body.estudianteId, clientId, deletedAt: null } });
      if (!student) throw new ApiError(404, "Estudiante no encontrado");
      grupoId = student.grupoId;
    }

    const payment = await prisma.monthlyPayment.update({
      where: { id },
      data: {
        ...body,
        grupoId,
        ...(body.estado === "NO_APLICA"
          ? { montoAbonado: 0, saldoPendiente: 0, fechaPago: null, fechaRegistro: null }
          : {}),
        estado: body.estado ?? (body.fechaVencimiento ? paymentStatusForDueDate(body.fechaVencimiento) : exists.estado)
      }
    });
    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const exists = await prisma.monthlyPayment.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Mensualidad no encontrada");
    await prisma.monthlyPayment.update({ where: { id }, data: { deletedAt: new Date() } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
