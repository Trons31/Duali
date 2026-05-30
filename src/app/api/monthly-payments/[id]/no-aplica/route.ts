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

    const payment = await prisma.$transaction(async (tx) => {
      const updated = await tx.monthlyPayment.update({
        where: { id },
        data: {
          estado: "NO_APLICA",
          montoAbonado: 0,
          saldoPendiente: 0,
          fechaPago: null,
          fechaRegistro: new Date(),
          registradoPorUserId: client.id,
          registradoPorNombre: client.nombre,
          notas: body.fechaProximoCobro
            ? `No aplica: ${body.motivo}. Proximo cobro: ${formatLocalDate(body.fechaProximoCobro)}`
            : `No aplica: ${body.motivo}`
        }
      });

      if (body.fechaProximoCobro) {
        const student = await tx.student.findFirst({
          where: { id: exists.estudianteId, clientId, deletedAt: null }
        });
        if (!student) throw new ApiError(404, "Estudiante no encontrado");

        const nextMonth = body.fechaProximoCobro.getMonth() + 1;
        const nextYear = body.fechaProximoCobro.getFullYear();
        const nextBillingDay = body.fechaProximoCobro.getDate();
        const amount = student.precioMensualidad ?? exists.monto;

        await tx.student.update({
          where: { id: student.id },
          data: { diaCobro: Math.min(nextBillingDay, 28) }
        });

        await tx.monthlyPayment.upsert({
          where: {
            estudianteId_mes_anio: {
              estudianteId: student.id,
              mes: nextMonth,
              anio: nextYear
            }
          },
          create: {
            estudianteId: student.id,
            grupoId: student.grupoId,
            clientId,
            mes: nextMonth,
            anio: nextYear,
            monto: amount,
            saldoPendiente: amount,
            fechaVencimiento: body.fechaProximoCobro,
            estado: body.fechaProximoCobro < startOfToday() ? "VENCIDO" : "PENDIENTE",
            notas: `Generado por excepcion No aplica del cobro ${exists.mes}/${exists.anio}`
          },
          update: {
            fechaVencimiento: body.fechaProximoCobro,
            estado: body.fechaProximoCobro < startOfToday() ? "VENCIDO" : "PENDIENTE"
          }
        });
      }

      return updated;
    });

    return ok(payment);
  } catch (error) {
    return handleError(error);
  }
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}
