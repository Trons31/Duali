import { requireClient } from "@/lib/auth";
import { created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { groupSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const groups = await prisma.group.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        students: {
          where: { deletedAt: null },
          select: { id: true, estado: true, precioMensualidad: true }
        },
        _count: {
          select: { students: true, monthlyPayments: true, suppliesPayments: true }
        }
      }
    });
    return ok(groups);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = groupSchema.parse(await readBody(request));
    const group = await prisma.group.create({ data: { ...body, clientId } });
    return created(group);
  } catch (error) {
    return handleError(error);
  }
}
