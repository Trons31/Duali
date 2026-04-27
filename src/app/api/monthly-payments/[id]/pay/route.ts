import { requireClient } from "@/lib/auth";
import { localDateAtNoon, nextMonthlyPeriod, paymentStatusForDueDate } from "@/lib/dates";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { payMonthlySchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = payMonthlySchema.parse(await readBody(request));
    const exists = await prisma.monthlyPayment.findFirst({
      where: { id, clientId, deletedAt: null },
      include: { student: true }
    });
    if (!exists) throw new ApiError(404, "Mensualidad no encontrada");

    const payment = await prisma.$transaction(async (tx) => {
      const paidPayment = await tx.monthlyPayment.update({
        where: { id },
        data: {
          estado: "PAGADO",
          fechaPago: body.fechaPago ?? new Date(),
          metodoPago: body.metodoPago,
          comprobanteUrl: body.comprobanteUrl,
          notas: body.notas
        }
      });

      if (exists.student.estado === "ACTIVO") {
        const nextPeriod = nextMonthlyPeriod(exists.mes, exists.anio);
        const billingDay = exists.student.diaCobro ?? exists.fechaVencimiento.getDate();
        const fechaVencimiento = localDateAtNoon(nextPeriod.anio, nextPeriod.mes, billingDay);
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
