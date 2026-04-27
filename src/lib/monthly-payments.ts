import { currentMonthlyPeriod, localDateAtNoon, paymentStatusForDueDate, startOfLocalDay } from "./dates";
import { prisma } from "./prisma";

export async function ensureCurrentMonthlyPayments(clientId: string) {
  const { mes, anio } = currentMonthlyPeriod();
  const todayStart = startOfLocalDay();
  const students = await prisma.student.findMany({
    where: {
      clientId,
      deletedAt: null,
      estado: "ACTIVO",
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
  });

  if (students.length === 0) return;

  await prisma.monthlyPayment.createMany({
    data: students.map((student) => {
      const fechaVencimiento = localDateAtNoon(anio, mes, student.diaCobro ?? 10);
      return {
        estudianteId: student.id,
        grupoId: student.grupoId,
        clientId,
        mes,
        anio,
        monto: student.precioMensualidad ?? 0,
        fechaVencimiento,
        estado: paymentStatusForDueDate(fechaVencimiento)
      };
    }),
    skipDuplicates: true
  });
}
