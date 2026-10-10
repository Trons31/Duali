import { requireClient } from "@/lib/auth";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { serializeStudioMember, studioMemberInclude } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { dateKeyToDate, studioTodayKey } from "@/lib/studio-time";
import { studioMemberSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

async function findMember(clientId: string, id: string) {
  const member = await prisma.studioMember.findFirst({
    where: { id, clientId, deletedAt: null },
    include: studioMemberInclude
  });
  if (!member) throw new ApiError(404, "Cliente no encontrado");
  return member;
}

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    return ok(serializeStudioMember(await findMember(clientId, id), studioTodayKey()));
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    await findMember(clientId, id);
    const { fechaNacimiento, ...body } = studioMemberSchema.partial().parse(await readBody(request));

    if (body.celular) {
      const owner = await prisma.studioMember.findUnique({
        where: { clientId_celular: { clientId, celular: body.celular } }
      });
      if (owner && owner.id !== id) {
        // Un celular borrado tambien ocupa el indice unico: hay que avisar igual.
        throw new ApiError(
          409,
          owner.deletedAt
            ? "Ese celular es de un cliente eliminado. Créalo de nuevo para recuperar su ficha."
            : `Ese celular ya es de ${owner.nombre}${owner.apellido ? ` ${owner.apellido}` : ""}`
        );
      }
    }

    const member = await prisma.studioMember.update({
      where: { id },
      data: {
        ...body,
        ...(fechaNacimiento !== undefined ? { fechaNacimiento: fechaNacimiento ? dateKeyToDate(fechaNacimiento) : null } : {})
      },
      include: studioMemberInclude
    });

    return ok(serializeStudioMember(member, studioTodayKey()));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const member = serializeStudioMember(await findMember(clientId, id), studioTodayKey());

    if (member.vigentes.length || member.saldo > 0) {
      throw new ApiError(409, "Tiene paquetes vigentes o saldo pendiente. Anúlalos o cóbralos antes de eliminarlo.");
    }

    await prisma.studioMember.update({ where: { id }, data: { deletedAt: new Date() } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
