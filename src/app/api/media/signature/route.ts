import { requireClient } from "@/lib/auth";
import { signUpload } from "@/lib/cloudinary";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { mediaSignatureSchema } from "@/lib/validations";

// Spec 010 R1: firma una subida directa a Cloudinary en la carpeta del negocio.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { kind, use } = mediaSignatureSchema.parse(await readBody(request));
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { moduloEstudio: true } });
    if (!client.moduloEstudio) throw new ApiError(403, "Activa el módulo Estudio para subir archivos");
    return ok(await signUpload(clientId, kind, use));
  } catch (error) {
    return handleError(error);
  }
}
