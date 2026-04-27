import { prisma } from "./prisma";
import { endOfCurrentMonth, startOfCurrentMonth, startOfLocalDay, startOfNextLocalDay } from "./dates";
import { ensureCurrentMonthlyPayments } from "./monthly-payments";

export async function getAccountingSummary(clientId: string) {
  await ensureCurrentMonthlyPayments(clientId);

  const monthStart = startOfCurrentMonth();
  const monthEnd = endOfCurrentMonth();
  const todayStart = startOfLocalDay();
  const tomorrowStart = startOfNextLocalDay();

  const [monthlyIncome, suppliesIncome, expenses, pendingTodayAmount, monthlyReceivedThisMonth, activeStudents, pendingTodayPayments, overduePayments] = await Promise.all([
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
      where: {
        clientId,
        deletedAt: null,
        estado: "PENDIENTE",
        fechaVencimiento: { gte: todayStart, lt: tomorrowStart }
      },
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
    prisma.monthlyPayment.count({
      where: {
        clientId,
        deletedAt: null,
        estado: "PENDIENTE",
        fechaVencimiento: { gte: todayStart, lt: tomorrowStart }
      }
    }),
    prisma.monthlyPayment.count({
      where: {
        clientId,
        deletedAt: null,
        OR: [{ estado: "VENCIDO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } }]
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
    pendientesPorCobrar: Number(pendingTodayAmount._sum.monto ?? 0),
    pagosRecibidosEsteMes: Number(monthlyReceivedThisMonth._sum.monto ?? 0),
    estudiantesActivos: activeStudents,
    mensualidadesPendientes: pendingTodayPayments,
    mensualidadesVencidas: overduePayments
  };
}
