import type { Prisma } from "@prisma/client";
import { assertOwnedMedia, deleteFromCloudinary } from "@/lib/cloudinary";
import { ApiError } from "@/lib/http";
import type { MediaKind } from "@/lib/media-folders";
import { prisma } from "@/lib/prisma";
import { parseVideoLink } from "@/lib/video-links";

// Publicaciones del estudio (spec 010 R2).

export const contentPostInclude = {
  discipline: { select: { id: true, nombre: true, color: true } }
} satisfies Prisma.ContentPostInclude;

type ContentPostRow = Prisma.ContentPostGetPayload<{ include: typeof contentPostInclude }>;

export function serializeContentPost(row: ContentPostRow) {
  const link = row.enlaceVideo ? parseVideoLink(row.enlaceVideo) : null;
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    cuerpo: row.cuerpo,
    discipline: row.discipline,
    mediaUrl: row.mediaUrl,
    mediaPublicId: row.mediaPublicId,
    mediaKind: row.mediaKind as MediaKind | null,
    enlaceVideo: row.enlaceVideo,
    embed: link ? { provider: link.provider, url: link.embedUrl } : null,
    publicado: row.publicado,
    fijado: row.fijado,
    publicadoEn: row.publicadoEn?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

export type ContentPostView = ReturnType<typeof serializeContentPost>;

type PostInput = {
  tipo?: "PUBLICACION" | "VIDEO";
  titulo?: string;
  cuerpo?: string | null;
  disciplineId?: string | null;
  media?: { url: string; publicId: string } | null;
  enlaceVideo?: string | null;
  publicado?: boolean;
  fijado?: boolean;
};

/**
 * Valida y arma los datos de una publicacion. Al editar, las reglas se aplican
 * sobre el resultado final (lo guardado + lo que llega), no solo sobre el body.
 */
export async function buildPostData(clientId: string, input: PostInput, current?: ContentPostRow) {
  const tipo = input.tipo ?? current?.tipo;
  if (!tipo) throw new ApiError(422, "Falta el tipo de publicación");

  if (input.disciplineId) {
    const discipline = await prisma.discipline.findFirst({
      where: { id: input.disciplineId, clientId, deletedAt: null },
      select: { id: true }
    });
    if (!discipline) throw new ApiError(422, "La disciplina no existe");
  }

  // VIDEO lleva video subido; PUBLICACION, foto.
  const mediaKind: MediaKind = tipo === "VIDEO" ? "VIDEO" : "IMAGEN";
  if (input.media) assertOwnedMedia(input.media, clientId, mediaKind);

  const media =
    input.media === undefined
      ? current?.mediaPublicId && current.mediaUrl
        ? { url: current.mediaUrl, publicId: current.mediaPublicId }
        : null
      : input.media;
  if (media && input.media === undefined && current?.mediaKind && current.mediaKind !== mediaKind) {
    throw new ApiError(422, "El archivo no corresponde al tipo de publicación");
  }

  let enlaceVideo = input.enlaceVideo === undefined ? (current?.enlaceVideo ?? null) : input.enlaceVideo || null;
  if (enlaceVideo) {
    if (tipo !== "VIDEO") throw new ApiError(422, "Solo las publicaciones de video llevan enlace");
    const link = parseVideoLink(enlaceVideo);
    if (!link) throw new ApiError(422, "Usa un enlace de YouTube, Instagram o TikTok");
    enlaceVideo = link.url;
  }

  if (tipo === "VIDEO" && Boolean(media) === Boolean(enlaceVideo)) {
    throw new ApiError(422, "Un video lleva un archivo subido o un enlace, uno de los dos");
  }

  const publicado = input.publicado ?? current?.publicado ?? false;
  return {
    tipo,
    ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
    ...(input.cuerpo !== undefined ? { cuerpo: input.cuerpo } : {}),
    ...(input.disciplineId !== undefined ? { disciplineId: input.disciplineId } : {}),
    mediaUrl: media?.url ?? null,
    mediaPublicId: media?.publicId ?? null,
    mediaKind: media ? mediaKind : null,
    enlaceVideo,
    publicado,
    ...(input.fijado !== undefined ? { fijado: input.fijado } : {}),
    // La fecha de publicacion se pone al publicar por primera vez y se conserva.
    publicadoEn: publicado ? (current?.publicadoEn ?? new Date()) : null
  };
}

/** Archivo que dejo de usarse al editar: se borra de Cloudinary sin bloquear. */
export async function releaseMedia(previous: ContentPostRow, nextPublicId: string | null) {
  if (previous.mediaPublicId && previous.mediaPublicId !== nextPublicId) {
    await deleteFromCloudinary(previous.mediaPublicId, (previous.mediaKind as MediaKind) ?? "IMAGEN");
  }
}

export async function listPublishedPosts(clientId: string, take = 12) {
  const rows = await prisma.contentPost.findMany({
    where: { clientId, deletedAt: null, publicado: true },
    include: contentPostInclude,
    orderBy: [{ fijado: "desc" }, { publicadoEn: "desc" }],
    take
  });
  return rows.map(serializeContentPost);
}
