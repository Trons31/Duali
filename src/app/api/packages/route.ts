import { requireClient } from "@/lib/auth";
import { ApiError, created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertUniquePackageName } from "@/lib/studio";
import { packageCreateSchema } from "@/lib/validations";

const packageSelect = {
  id: true,
  disciplineId: true,
  nombre: true,
  clases: true,
  precio: true,
  vigenciaDias: true,
  visiblePublico: true,
  activo: true,
  orden: true,
  createdAt: true
} as const;

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const packages = await prisma.package.findMany({
      where: { clientId, deletedAt: null },
      select: packageSelect,
      orderBy: [{ clases: "asc" }, { orden: "asc" }, { createdAt: "asc" }]
    });

    return ok(packages);
  } catch (error) {
    return handleError(error);
  }
}

// Spec 004 R2: un paquete por cada disciplina elegida, con los mismos datos.
// Asi el menu se carga en pocos pasos y despues se ajusta el precio que cambie.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { disciplineIds, ...body } = packageCreateSchema.parse(await readBody(request));
    const ids = [...new Set(disciplineIds)];

    const valid = await prisma.discipline.count({
      where: { id: { in: ids }, clientId, deletedAt: null, activa: true }
    });
    if (valid !== ids.length) throw new ApiError(422, "Alguna disciplina no existe o está inactiva");

    await assertUniquePackageName(clientId, ids, body.nombre);

    const packages = await prisma.$transaction(
      ids.map((disciplineId) =>
        prisma.package.create({ data: { ...body, clientId, disciplineId }, select: packageSelect })
      )
    );

    return created(packages);
  } catch (error) {
    return handleError(error);
  }
}
