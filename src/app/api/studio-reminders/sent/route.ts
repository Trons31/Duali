import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { studioMessageSentSchema } from "@/lib/validations";

// Spec 011 R6: registra que la duena envio un aviso. Reenviar actualiza la fecha.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = studioMessageSentSchema.parse(await readBody(request));
    const member = await prisma.studioMember.findFirst({ where: { id: body.memberId, clientId }, select: { id: true } });
    if (!member) throw new ApiError(404, "Cliente no encontrado");

    const message = await prisma.studioMessage.upsert({
      where: { clientId_tipo_refKey: { clientId, tipo: body.tipo, refKey: body.refKey } },
      update: { sentAt: new Date(), memberId: member.id },
      create: { clientId, memberId: member.id, tipo: body.tipo, refKey: body.refKey },
      select: { tipo: true, refKey: true, sentAt: true }
    });
    return ok(message);
  } catch (error) {
    return handleError(error);
  }
}
