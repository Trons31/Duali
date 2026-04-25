import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { payMonthlySchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = payMonthlySchema.parse(await readBody(request));
    const exists = await prisma.monthlyPayment.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Mensualidad no encontrada");

    const payment = await prisma.monthlyPayment.update({
      where: { id },
      data: {
        estado: "PAGADO",
        fechaPago: body.fechaPago ?? new Date(),
        metodoPago: body.metodoPago,
        comprobanteUrl: body.comprobanteUrl,
        notas: body.notas
      }
    });

    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}
