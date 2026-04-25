import { prisma } from "./prisma";
import { endOfCurrentMonth, startOfCurrentMonth } from "./dates";

export async function getAccountingSummary(clientId: string) {
  const monthStart = startOfCurrentMonth();
  const monthEnd = endOfCurrentMonth();

  const [monthlyIncome, suppliesIncome, expenses, pendingAmount, monthlyReceivedThisMonth, activeStudents, pendingPayments, overduePayments] = await Promise.all([
    prisma.monthlyPayment.aggregate({
      where: { clientId, deletedAt: null, estado: "PAGADO" },
      _sum: { monto: true }
    }),
    prisma.suppliesPayment.aggregate({
      where: { clientId, deletedAt: null, estado: "PAGADO" },
      _sum: { monto: true }
    }),
    prisma.expense.aggregate({
      where: { clientId, deletedAt: null },
      _sum: { monto: true }
    }),
    prisma.monthlyPayment.aggregate({
      where: { clientId, deletedAt: null, estado: { in: ["PENDIENTE", "VENCIDO"] } },
      _sum: { monto: true }
    }),
    prisma.monthlyPayment.aggregate({
      where: {
        clientId,
        deletedAt: null,
        estado: "PAGADO",
        fechaPago: { gte: monthStart, lte: monthEnd }
      },
      _sum: { monto: true }
    }),
    prisma.student.count({ where: { clientId, deletedAt: null, estado: "ACTIVO" } }),
    prisma.monthlyPayment.count({ where: { clientId, deletedAt: null, estado: "PENDIENTE" } }),
    prisma.monthlyPayment.count({
      where: {
        clientId,
        deletedAt: null,
        OR: [{ estado: "VENCIDO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: new Date() } }]
      }
    })
  ]);

  const ingresosMensualidades = Number(monthlyIncome._sum.monto ?? 0);
  const ingresosUtiles = Number(suppliesIncome._sum.monto ?? 0);
  const totalGastos = Number(expenses._sum.monto ?? 0);
  const ingresosTotales = ingresosMensualidades + ingresosUtiles;

  return {
    ingresosMensualidades,
    ingresosUtiles,
    ingresosTotales,
    gastosTotales: totalGastos,
    balance: ingresosTotales - totalGastos,
    pendientesPorCobrar: Number(pendingAmount._sum.monto ?? 0),
    pagosRecibidosEsteMes: Number(monthlyReceivedThisMonth._sum.monto ?? 0),
    estudiantesActivos: activeStudents,
    mensualidadesPendientes: pendingPayments,
    mensualidadesVencidas: overduePayments
  };
}
