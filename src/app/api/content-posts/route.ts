import { requireClient } from "@/lib/auth";
import { buildPostData, contentPostInclude, serializeContentPost } from "@/lib/content";
import { created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { contentPostSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const posts = await prisma.contentPost.findMany({
      where: { clientId, deletedAt: null },
      include: contentPostInclude,
      orderBy: [{ fijado: "desc" }, { createdAt: "desc" }]
    });
    return ok(posts.map(serializeContentPost));
  } catch (error) {
    return handleError(error);
  }
}

// Spec 010 R2.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = contentPostSchema.parse(await readBody(request));
    const data = await buildPostData(clientId, body);
    const post = await prisma.contentPost.create({
      data: { ...data, titulo: body.titulo, clientId },
      include: contentPostInclude
    });
    return created(serializeContentPost(post));
  } catch (error) {
    return handleError(error);
  }
}
