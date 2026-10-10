import { requireClient } from "@/lib/auth";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  assertDisciplineCanBeDeleted,
  assertUniqueDisciplineName,
  disciplineInclude,
  resolveComboItems,
  serializeDiscipline
} from "@/lib/studio";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { mediaColumns } from "@/lib/media-fields";
import { disciplineSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

async function findDiscipline(clientId: string, id: string) {
  const discipline = await prisma.discipline.findFirst({ where: { id, clientId, deletedAt: null } });
  if (!discipline) throw new ApiError(404, "Disciplina no encontrada");
  return discipline;
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const current = await findDiscipline(clientId, id);
    // El tipo no se cambia despues de creada: pasar un combo a clase dejaria
    // paquetes que valen para varias disciplinas colgados de una sola.
    const { incluyeIds, tipo: _tipo, imagen, ...body } = disciplineSchema.partial().parse(await readBody(request));
    const imageData = mediaColumns("imagen", imagen, clientId);

    if (body.nombre) await assertUniqueDisciplineName(clientId, body.nombre, id);
    if (body.activa === false && current.tipo === "CLASE") {
      // Desactivar una clase incluida en un combo la sacaria del combo sin aviso.
      const inCombo = await prisma.disciplineComboItem.count({ where: { disciplineId: id, combo: { deletedAt: null } } });
      if (inCombo) throw new ApiError(409, "Está incluida en un combo. Quítala del combo antes de desactivarla.");
    }

    const comboIds =
      current.tipo === "COMBO" && incluyeIds !== undefined ? await resolveComboItems(clientId, incluyeIds) : null;

    const discipline = await prisma.$transaction(async (tx) => {
      if (comboIds) {
        await tx.disciplineComboItem.deleteMany({ where: { comboId: id } });
        await tx.disciplineComboItem.createMany({ data: comboIds.map((disciplineId) => ({ comboId: id, disciplineId })) });
      }

      return tx.discipline.update({ where: { id }, data: { ...body, ...imageData }, include: disciplineInclude });
    });

    // La imagen anterior se borra de Cloudinary solo despues de guardar.
    if (imagen !== undefined && current.imagenPublicId && current.imagenPublicId !== imagen?.publicId) {
      await deleteFromCloudinary(current.imagenPublicId, "IMAGEN");
    }

    return ok(serializeDiscipline(discipline));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    await findDiscipline(clientId, id);
    await assertDisciplineCanBeDeleted(clientId, id);
    await prisma.discipline.update({ where: { id }, data: { deletedAt: new Date(), activa: false } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
