import { requireClient } from "@/lib/auth";
import { created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  assertUniqueDisciplineName,
  disciplineInclude,
  resolveComboItems,
  serializeDiscipline
} from "@/lib/studio";
import { mediaColumns } from "@/lib/media-fields";
import { disciplineSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const disciplines = await prisma.discipline.findMany({
      where: { clientId, deletedAt: null },
      include: disciplineInclude,
      orderBy: [{ tipo: "asc" }, { orden: "asc" }, { createdAt: "asc" }]
    });

    return ok(disciplines.map(serializeDiscipline));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { incluyeIds, imagen, ...body } = disciplineSchema.parse(await readBody(request));
    await assertUniqueDisciplineName(clientId, body.nombre);
    const comboIds = body.tipo === "COMBO" ? await resolveComboItems(clientId, incluyeIds) : [];

    const discipline = await prisma.discipline.create({
      data: {
        ...body,
        ...mediaColumns("imagen", imagen, clientId),
        clientId,
        comboItems: comboIds.length ? { create: comboIds.map((disciplineId) => ({ disciplineId })) } : undefined
      },
      include: disciplineInclude
    });

    return created(serializeDiscipline(discipline));
  } catch (error) {
    return handleError(error);
  }
}
