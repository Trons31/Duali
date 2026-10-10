import { Prisma } from "@prisma/client";
import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { suggestSlug } from "@/lib/studio-constants";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { mediaColumns } from "@/lib/media-fields";
import { publicPageSchema } from "@/lib/validations";

const select = {
  slug: true,
  paginaPublicaActiva: true,
  moduloEstudio: true,
  businessName: true,
  portadaUrl: true,
  portadaPublicId: true
} as const;

async function suggestionFor(clientId: string, businessName: string) {
  const base = suggestSlug(businessName);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 37)}-${attempt + 1}`;
    const taken = await prisma.client.findFirst({ where: { slug: candidate, id: { not: clientId } }, select: { id: true } });
    if (!taken) return candidate;
  }
  return null;
}

// Spec 008 R1: direccion y publicacion de la pagina del estudio.
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select });
    return ok({ ...client, sugerido: client.slug ?? (await suggestionFor(clientId, client.businessName)) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { portada, ...body } = publicPageSchema.parse(await readBody(request));
    const current = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select });

    if (body.slug && body.slug !== current.slug) {
      const taken = await prisma.client.findFirst({ where: { slug: body.slug, id: { not: clientId } }, select: { id: true } });
      if (taken) throw new ApiError(409, "Esa dirección ya la usa otro negocio");
    }

    const slug = body.slug ?? current.slug;
    if (body.paginaPublicaActiva) {
      if (!slug) throw new ApiError(422, "Elige una dirección antes de publicar");
      if (!current.moduloEstudio) throw new ApiError(422, "Activa el módulo Estudio en Ajustes para publicar tu página");
    }

    const data = { ...body, ...mediaColumns("portada", portada, clientId) };
    const updated = await prisma.client.update({ where: { id: clientId }, data, select }).catch((error) => {
      // Otro negocio tomo la misma direccion entre la verificacion y el guardado.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiError(409, "Esa dirección ya la usa otro negocio");
      }
      throw error;
    });
    if (portada !== undefined && current.portadaPublicId && current.portadaPublicId !== portada?.publicId) {
      await deleteFromCloudinary(current.portadaPublicId, "IMAGEN");
    }
    return ok({ ...updated, sugerido: updated.slug });
  } catch (error) {
    return handleError(error);
  }
}
