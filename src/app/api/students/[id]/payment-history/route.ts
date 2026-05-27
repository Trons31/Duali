import { requireClient } from "@/lib/auth";
import { paymentStatusForDueDate } from "@/lib/dates";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { studentPaymentHistoryUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);

    return ok(await getStudentPaymentHistory(clientId, id));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId, client } = await requireClient(request);
    const body = studentPaymentHistoryUpdateSchema.parse(await readBody(request));

    const payment = await prisma.monthlyPayment.findFirst({
      where: {
        id: body.paymentId,
        estudianteId: id,
        clientId,
        deletedAt: null,
        student: {
          deletedAt: null
        }
      }
    });

    if (!payment) throw new ApiError(404, "Mensualidad no encontrada para este alumno");

    await prisma.$transaction(async (tx) => {
      if (body.paid) {
        const fechaRegistro = new Date();
        await tx.paymentInstallment.deleteMany({
          where: {
            clientId,
            monthlyPaymentId: payment.id
          }
        });

        await tx.monthlyPayment.update({
          where: { id: payment.id },
          data: {
            estado: "PAGADO",
            fechaPago: body.fechaPago ?? fechaRegistro,
            fechaRegistro,
            metodoPago: body.metodoPago ?? payment.metodoPago ?? "MANUAL",
            registradoPorUserId: client.id,
            registradoPorNombre: client.nombre,
            montoAbonado: payment.monto,
            saldoPendiente: 0,
            cantidadAbonos: 0,
            ultimoMetodoAbono: null,
            fechaUltimoAbono: null
          }
        });
        return;
      }

      await tx.paymentInstallment.deleteMany({
        where: {
          clientId,
          monthlyPaymentId: payment.id
        }
      });

      await tx.monthlyPayment.update({
        where: { id: payment.id },
        data: {
          estado: paymentStatusForDueDate(payment.fechaVencimiento),
          fechaPago: null,
          fechaRegistro: null,
          metodoPago: null,
          registradoPorUserId: null,
          registradoPorNombre: null,
          ultimoMetodoAbono: null,
          fechaUltimoAbono: null,
          montoAbonado: 0,
          saldoPendiente: payment.monto,
          cantidadAbonos: 0,
          comprobanteUrl: null
        }
      });
    });

    return ok(await getStudentPaymentHistory(clientId, id));
  } catch (error) {
    return handleError(error);
  }
}

async function getStudentPaymentHistory(clientId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, clientId, deletedAt: null },
    include: {
      group: {
        select: {
          id: true,
          nombre: true
        }
      }
    }
  });

  if (!student) throw new ApiError(404, "Estudiante no encontrado");

  const paymentHistory = await prisma.monthlyPayment.findMany({
    where: {
      estudianteId: student.id,
      clientId,
      deletedAt: null
    },
    orderBy: [{ anio: "desc" }, { mes: "desc" }],
    select: {
      id: true,
      mes: true,
      anio: true,
      monto: true,
      montoAbonado: true,
      saldoPendiente: true,
      cantidadAbonos: true,
      estado: true,
      fechaVencimiento: true,
      fechaPago: true,
      metodoPago: true,
      updatedAt: true
    }
  });

  return {
    student: {
      id: student.id,
      nombre: student.nombre,
      apellido: student.apellido,
      group: student.group
    },
    paymentHistory: paymentHistory.map((payment) => ({
      id: payment.id,
      mes: payment.mes,
      anio: payment.anio,
      monto: Number(payment.monto),
      montoAbonado: Number(payment.montoAbonado),
      saldoPendiente: Number(payment.saldoPendiente),
      cantidadAbonos: payment.cantidadAbonos,
      estado: payment.estado,
      fechaVencimiento: payment.fechaVencimiento.toISOString(),
      fechaPago: payment.fechaPago?.toISOString() ?? null,
      metodoPago: payment.metodoPago,
      updatedAt: payment.updatedAt.toISOString()
    })),
    summary: {
      totalCount: paymentHistory.length,
      paidCount: paymentHistory.filter((payment) => payment.estado === "PAGADO").length,
      pendingCount: paymentHistory.filter((payment) => payment.estado !== "PAGADO").length
    }
  };
}
