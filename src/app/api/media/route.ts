import { requireClient } from "@/lib/auth";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { ApiError, handleError, noContent, readBody } from "@/lib/http";
import { belongsToBusiness } from "@/lib/media-folders";
import { prisma } from "@/lib/prisma";
import { mediaDiscardSchema } from "@/lib/validations";

// Spec 010 (revision): si el guardado falla despues de subir, el panel descarta
// el archivo. Solo se borra si es de este negocio y ningun registro lo usa.
export async function DELETE(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { publicId, kind } = mediaDiscardSchema.parse(await readBody(request));
    if (!belongsToBusiness(publicId, clientId, kind)) throw new ApiError(422, "Ese archivo no pertenece a tu negocio");

    const [posts, clients, disciplines, receipts] = await Promise.all([
      prisma.contentPost.count({ where: { clientId, mediaPublicId: publicId, deletedAt: null } }),
      prisma.client.count({ where: { id: clientId, portadaPublicId: publicId } }),
      prisma.discipline.count({ where: { clientId, imagenPublicId: publicId, deletedAt: null } }),
      prisma.paymentReceipt.count({ where: { clientId, publicId, estado: { not: "RECHAZADO" } } })
    ]);
    if (posts + clients + disciplines + receipts > 0) throw new ApiError(409, "El archivo está en uso");

    await deleteFromCloudinary(publicId, kind);
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
