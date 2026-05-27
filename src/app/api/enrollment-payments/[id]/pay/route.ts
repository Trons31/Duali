import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { payEnrollmentSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId, client } = await requireClient(request);
    const body = payEnrollmentSchema.parse(await readBody(request));
    const exists = await prisma.enrollmentPayment.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Inscripción no encontrada");

    const fechaRegistro = new Date();
    const payment = await prisma.enrollmentPayment.update({
      where: { id },
      data: {
        estado: "PAGADO",
        fechaPago: body.fechaPago ?? fechaRegistro,
        fechaRegistro,
        metodoPago: body.metodoPago,
        registradoPorUserId: client.id,
        registradoPorNombre: client.nombre,
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
