import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { noAplicaMonthlyPaymentSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId, client } = await requireClient(request);
    const body = noAplicaMonthlyPaymentSchema.parse(await readBody(request));
    const exists = await prisma.monthlyPayment.findFirst({ where: { id, clientId, deletedAt: null } });

    if (!exists) throw new ApiError(404, "Mensualidad no encontrada");
    if (exists.estado === "PAGADO") throw new ApiError(409, "No se puede marcar como No aplica una mensualidad pagada");
    if (Number(exists.montoAbonado) > 0) throw new ApiError(409, "No se puede marcar como No aplica una mensualidad con abonos");

    const payment = await prisma.monthlyPayment.update({
      where: { id },
      data: {
        estado: "NO_APLICA",
        montoAbonado: 0,
        saldoPendiente: 0,
        fechaPago: null,
        fechaRegistro: new Date(),
        registradoPorUserId: client.id,
        registradoPorNombre: client.nombre,
        notas: `No aplica: ${body.motivo}`
      }
    });

    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}
