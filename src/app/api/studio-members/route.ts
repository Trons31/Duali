import { requireClient } from "@/lib/auth";
import { ApiError, created, handleError, ok, readBody } from "@/lib/http";
import { serializeStudioMember, studioMemberInclude } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { dateKeyToDate, studioTodayKey } from "@/lib/studio-time";
import { studioMemberSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const q = new URL(request.url).searchParams.get("q")?.trim();
    const digits = q?.replace(/\D/g, "");

    const members = await prisma.studioMember.findMany({
      where: {
        clientId,
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { apellido: { contains: q, mode: "insensitive" } },
                ...(digits ? [{ celular: { contains: digits } }] : [])
              ]
            }
          : {})
      },
      include: studioMemberInclude,
      orderBy: [{ nombre: "asc" }, { apellido: "asc" }]
    });

    const today = studioTodayKey();
    return ok(members.map((member) => serializeStudioMember(member, today)));
  } catch (error) {
    return handleError(error);
  }
}

// Spec 006 R1: el celular identifica al cliente. Si ese celular estaba borrado
// se restaura la ficha (con su historia) en vez de chocar con el indice unico.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { fechaNacimiento, ...body } = studioMemberSchema.parse(await readBody(request));
    const data = {
      ...body,
      ...(fechaNacimiento !== undefined ? { fechaNacimiento: fechaNacimiento ? dateKeyToDate(fechaNacimiento) : null } : {})
    };

    const existing = await prisma.studioMember.findUnique({
      where: { clientId_celular: { clientId, celular: body.celular } }
    });
    if (existing && !existing.deletedAt) {
      throw new ApiError(409, `Ese celular ya es de ${existing.nombre}${existing.apellido ? ` ${existing.apellido}` : ""}`);
    }

    const member = existing
      ? await prisma.studioMember.update({
          where: { id: existing.id },
          data: { ...data, deletedAt: null },
          include: studioMemberInclude
        })
      : await prisma.studioMember.create({ data: { ...data, clientId }, include: studioMemberInclude });

    return created(serializeStudioMember(member, studioTodayKey()));
  } catch (error) {
    return handleError(error);
  }
}
