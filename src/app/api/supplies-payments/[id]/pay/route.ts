import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ fechaPago: z.coerce.date().optional() });

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = schema.parse(await readBody(request));
    const exists = await prisma.suppliesPayment.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Pago de útiles no encontrado");

    const payment = await prisma.suppliesPayment.update({
      where: { id },
      data: { estado: "PAGADO", fechaPago: body.fechaPago ?? new Date() }
    });

    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}
