import { requireClient } from "@/lib/auth";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertUniquePackageName } from "@/lib/studio";
import { packageUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

async function findPackage(clientId: string, id: string) {
  const item = await prisma.package.findFirst({ where: { id, clientId, deletedAt: null } });
  if (!item) throw new ApiError(404, "Paquete no encontrado");
  return item;
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const current = await findPackage(clientId, id);
    const body = packageUpdateSchema.parse(await readBody(request));

    if (body.nombre) await assertUniquePackageName(clientId, [current.disciplineId], body.nombre, id);

    const item = await prisma.package.update({ where: { id }, data: body });
    return ok(item);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    await findPackage(clientId, id);
    // Borrado logico: cuando existan ventas (spec 006) deben seguir apuntando aqui.
    await prisma.package.update({ where: { id }, data: { deletedAt: new Date(), activo: false } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
