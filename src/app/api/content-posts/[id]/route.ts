import { requireClient } from "@/lib/auth";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { buildPostData, contentPostInclude, releaseMedia, serializeContentPost } from "@/lib/content";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import type { MediaKind } from "@/lib/media-folders";
import { prisma } from "@/lib/prisma";
import { contentPostSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

async function findPost(clientId: string, id: string) {
  const post = await prisma.contentPost.findFirst({ where: { id, clientId, deletedAt: null }, include: contentPostInclude });
  if (!post) throw new ApiError(404, "Publicación no encontrada");
  return post;
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const current = await findPost(clientId, id);
    const body = contentPostSchema.partial().parse(await readBody(request));
    const data = await buildPostData(clientId, body, current);
    const post = await prisma.contentPost.update({ where: { id }, data, include: contentPostInclude });
    await releaseMedia(current, post.mediaPublicId);
    return ok(serializeContentPost(post));
  } catch (error) {
    return handleError(error);
  }
}

// Borrado logico en la base; el archivo si se borra de Cloudinary (best-effort).
export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const current = await findPost(clientId, id);
    await prisma.contentPost.update({ where: { id }, data: { deletedAt: new Date(), publicado: false } });
    await deleteFromCloudinary(current.mediaPublicId, (current.mediaKind as MediaKind) ?? "IMAGEN");
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
