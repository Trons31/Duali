import { currentMonthlyPeriod, endOfCurrentMonth, monthlyDueDateForPeriod, paymentStatusForDueDate, startOfLocalDay } from "./dates";
import { prisma } from "./prisma";
import { reactivateExpiredStudentPauses } from "./student-billing";

export async function ensureCurrentMonthlyPayments(clientId: string) {
  await prisma.$transaction(async (tx) => {
    await reactivateExpiredStudentPauses(tx, clientId);
  });

  const { mes, anio } = currentMonthlyPeriod();
  const todayStart = startOfLocalDay();
  const students = await prisma.student.findMany({
    where: {
      clientId,
      deletedAt: null,
      estado: "ACTIVO",
      OR: [{ fechaInicioClases: null }, { fechaInicioClases: { lte: endOfCurrentMonth() } }],
      precioMensualidad: { not: null },
      diaCobro: { not: null },
      monthlyPayments: {
        none: {
          deletedAt: null,
          OR: [
            { mes, anio },
            { fechaVencimiento: { gte: todayStart } }
          ]
        }
      }
    }
  }) as Array<{
    id: string;
    grupoId: string;
    precioMensualidad: number | string | null;
    diaCobro: number | null;
    modalidadMensualidad?: "ANTICIPADA" | "VENCIDA";
  }>;

  if (students.length === 0) return;

  await prisma.monthlyPayment.createMany({
    data: students.map((student) => {
      const fechaVencimiento = monthlyDueDateForPeriod(
        mes,
        anio,
        student.diaCobro ?? 10,
        student.modalidadMensualidad ?? "ANTICIPADA"
      );
      return {
        estudianteId: student.id,
        grupoId: student.grupoId,
        clientId,
        mes,
        anio,
        monto: student.precioMensualidad ?? 0,
        saldoPendiente: student.precioMensualidad ?? 0,
        fechaVencimiento,
        estado: paymentStatusForDueDate(fechaVencimiento)
      };
    }),
    skipDuplicates: true
  });
}
