import { requireClient } from "@/lib/auth";
import { ApiError, created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { studentSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const groupId = url.searchParams.get("groupId") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;

    const students = await prisma.student.findMany({
      where: {
        clientId,
        deletedAt: null,
        ...(groupId ? { grupoId: groupId } : {}),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { apellido: { contains: q, mode: "insensitive" } },
                { celular: { contains: q, mode: "insensitive" } },
                { telefonoPadre: { contains: q, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: "desc" },
      include: {
        group: true,
        monthlyPayments: {
          where: { deletedAt: null },
          orderBy: [{ anio: "desc" }, { mes: "desc" }],
          take: 6
        }
      }
    });

    return ok(students);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = studentSchema.parse(await readBody(request));
    const group = await prisma.group.findFirst({ where: { id: body.grupoId, clientId, deletedAt: null } });
    if (!group) throw new ApiError(404, "Grupo no encontrado");

    const student = await prisma.student.create({ data: { ...body, clientId } });
    return created(student);
  } catch (error) {
    return handleError(error);
  }
}
