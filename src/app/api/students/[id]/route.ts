import { requireClient } from "@/lib/auth";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { studentUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const student = await prisma.student.findFirst({
      where: { id, clientId, deletedAt: null },
      include: {
        group: true,
        monthlyPayments: { where: { deletedAt: null }, orderBy: [{ anio: "desc" }, { mes: "desc" }] },
        suppliesPayments: { where: { deletedAt: null }, orderBy: { fechaVencimiento: "desc" } }
      }
    });
    if (!student) throw new ApiError(404, "Estudiante no encontrado");
    return ok(student);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = studentUpdateSchema.parse(await readBody(request));
    const exists = await prisma.student.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Estudiante no encontrado");

    if (body.grupoId) {
      const group = await prisma.group.findFirst({ where: { id: body.grupoId, clientId, deletedAt: null } });
      if (!group) throw new ApiError(404, "Grupo no encontrado");
    }

    const student = await prisma.student.update({ where: { id }, data: body });
    return ok(student);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const exists = await prisma.student.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Estudiante no encontrado");
    await prisma.student.update({ where: { id }, data: { deletedAt: new Date(), estado: "INACTIVO" } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
