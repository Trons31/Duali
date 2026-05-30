import { Prisma } from "@prisma/client";
import { monthlyDueDateForPeriod, paymentStatusForDueDate, startOfLocalDay } from "@/lib/dates";

type BillingStudent = {
  id: string;
  diaCobro: number | null;
  modalidadMensualidad?: "ANTICIPADA" | "VENCIDA";
};

export async function syncOpenMonthlyPaymentDueDates(
  tx: Prisma.TransactionClient,
  student: BillingStudent,
  clientId: string
) {
  if (!student.diaCobro) return;

  const todayStart = startOfLocalDay();
  const openPayments = await tx.monthlyPayment.findMany({
    where: {
      clientId,
      estudianteId: student.id,
      deletedAt: null,
      estado: { in: ["PENDIENTE", "VENCIDO"] },
      fechaPago: null,
      montoAbonado: 0,
      fechaVencimiento: { gte: todayStart }
    },
    select: { id: true, mes: true, anio: true }
  });

  for (const payment of openPayments) {
    const fechaVencimiento = monthlyDueDateForPeriod(
      payment.mes,
      payment.anio,
      student.diaCobro,
      student.modalidadMensualidad ?? "ANTICIPADA"
    );

    await tx.monthlyPayment.update({
      where: { id: payment.id },
      data: {
        fechaVencimiento,
        estado: paymentStatusForDueDate(fechaVencimiento)
      }
    });
  }
}

export async function reactivateExpiredStudentPauses(tx: Prisma.TransactionClient, clientId: string) {
  await tx.student.updateMany({
    where: {
      clientId,
      deletedAt: null,
      estado: "PAUSADO",
      fechaFinPausa: { lt: startOfLocalDay() }
    },
    data: {
      estado: "ACTIVO",
      fechaInicioPausa: null,
      fechaFinPausa: null,
      motivoEstado: null
    }
  });
}
