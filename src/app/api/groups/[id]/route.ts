import { requireClient } from "@/lib/auth";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { groupUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const group = await prisma.group.findFirst({
      where: { id, clientId, deletedAt: null },
      include: {
        students: {
          where: { deletedAt: null },
          orderBy: [{ estado: "asc" }, { nombre: "asc" }, { apellido: "asc" }],
          include: {
            monthlyPayments: {
              where: {
                deletedAt: null,
                mes: currentMonth,
                anio: currentYear
              },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                mes: true,
                anio: true,
                monto: true,
                estado: true,
                fechaVencimiento: true,
                fechaPago: true
              }
            }
          }
        },
        _count: { select: { students: true, monthlyPayments: true } }
      }
    });
    if (!group) throw new ApiError(404, "Grupo no encontrado");
    return ok({
      ...group,
      period: {
        mes: currentMonth,
        anio: currentYear,
        label: `${currentMonth}/${currentYear}`
      }
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = groupUpdateSchema.parse(await readBody(request));
    const exists = await prisma.group.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Grupo no encontrado");
    const group = await prisma.group.update({ where: { id }, data: body });
    return ok(group);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const exists = await prisma.group.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Grupo no encontrado");
    await prisma.group.update({ where: { id }, data: { deletedAt: new Date() } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
