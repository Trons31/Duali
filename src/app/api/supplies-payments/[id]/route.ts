import { requireClient } from "@/lib/auth";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { suppliesPaymentSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const payment = await prisma.suppliesPayment.findFirst({
      where: { id, clientId, deletedAt: null },
      include: { student: true, group: true }
    });
    if (!payment) throw new ApiError(404, "Pago de útiles no encontrado");
    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = suppliesPaymentSchema.partial().parse(await readBody(request));
    const exists = await prisma.suppliesPayment.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Pago de útiles no encontrado");

    if (body.grupoId) {
      const group = await prisma.group.findFirst({ where: { id: body.grupoId, clientId, deletedAt: null } });
      if (!group) throw new ApiError(404, "Grupo no encontrado");
    }

    if (body.estudianteId) {
      const student = await prisma.student.findFirst({ where: { id: body.estudianteId, clientId, deletedAt: null } });
      if (!student) throw new ApiError(404, "Estudiante no encontrado");
    }

    const { studentIds, ...data } = body;
    const payment = await prisma.suppliesPayment.update({ where: { id }, data });
    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const exists = await prisma.suppliesPayment.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Pago de útiles no encontrado");
    await prisma.suppliesPayment.update({ where: { id }, data: { deletedAt: new Date() } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
