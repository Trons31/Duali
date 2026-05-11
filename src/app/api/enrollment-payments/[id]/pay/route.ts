import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { payEnrollmentSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = payEnrollmentSchema.parse(await readBody(request));
    const exists = await prisma.enrollmentPayment.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Inscripción no encontrada");

    const payment = await prisma.enrollmentPayment.update({
      where: { id },
      data: {
        estado: "PAGADO",
        fechaPago: body.fechaPago ?? new Date(),
        metodoPago: body.metodoPago,
        montoAbonado: exists.monto,
        saldoPendiente: 0,
        notas: body.notas
      },
      include: { student: { include: { group: true } } }
    });

    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}
