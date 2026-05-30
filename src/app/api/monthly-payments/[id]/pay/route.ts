import { requireClient } from "@/lib/auth";
import { monthlyDueDateForPeriod, nextMonthlyPeriod, paymentStatusForDueDate } from "@/lib/dates";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { payMonthlySchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId, client } = await requireClient(request);
    const body = payMonthlySchema.parse(await readBody(request));
    const exists = await prisma.monthlyPayment.findFirst({
      where: { id, clientId, deletedAt: null },
      include: { student: true }
    });
    if (!exists) throw new ApiError(404, "Mensualidad no encontrada");
    if (exists.estado === "NO_APLICA") throw new ApiError(409, "Esta mensualidad esta marcada como No aplica");
    const studentBillingMode =
      (exists.student as { modalidadMensualidad?: "ANTICIPADA" | "VENCIDA" }).modalidadMensualidad ?? "ANTICIPADA";

    const payment = await prisma.$transaction(async (tx) => {
      const fechaRegistro = new Date();
      const paidPayment = await tx.monthlyPayment.update({
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
          comprobanteUrl: body.comprobanteUrl,
          notas: body.notas
        }
      });

      if (exists.student.estado === "ACTIVO") {
        const nextPeriod = nextMonthlyPeriod(exists.mes, exists.anio);
        const billingDay = exists.student.diaCobro ?? exists.fechaVencimiento.getDate();
        const fechaVencimiento = monthlyDueDateForPeriod(
          nextPeriod.mes,
          nextPeriod.anio,
          billingDay,
          studentBillingMode
        );
        const existingNextPayment = await tx.monthlyPayment.findUnique({
          where: {
            estudianteId_mes_anio: {
              estudianteId: exists.estudianteId,
              mes: nextPeriod.mes,
              anio: nextPeriod.anio
            }
          }
        });

        if (!existingNextPayment) {
          await tx.monthlyPayment.create({
            data: {
              estudianteId: exists.estudianteId,
              grupoId: exists.grupoId,
              clientId,
              mes: nextPeriod.mes,
              anio: nextPeriod.anio,
              monto: exists.student.precioMensualidad ?? exists.monto,
              saldoPendiente: exists.student.precioMensualidad ?? exists.monto,
              fechaVencimiento,
              estado: paymentStatusForDueDate(fechaVencimiento)
            }
          });
        }
      }

      return paidPayment;
    });

    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}
