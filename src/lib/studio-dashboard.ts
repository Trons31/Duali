import { getPendingAttendance } from "@/lib/attendance";
import { listClassSessions } from "@/lib/class-sessions";
import { expiredWithoutRenewal, memberPackageInclude, serializeMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { addDaysToKey, dateKeyToDate, dateToDateKey, startOfWeekKey, studioNow } from "@/lib/studio-time";

// Datos del Inicio del estudio (spec 013). Todo en hora de Bogota.

/** Inicio y fin (exclusivo) del mes de Bogota que contiene `dateKey`, como instantes UTC. */
export function studioMonthRange(dateKey: string) {
  const [year, month] = dateKey.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  return {
    from: new Date(`${dateKey.slice(0, 7)}-01T00:00:00-05:00`),
    to: new Date(`${next}-01T00:00:00-05:00`)
  };
}

export async function getStudioDashboard(clientId: string, instant = new Date()) {
  const today = studioNow(instant).dateKey;
  const tomorrow = addDaysToKey(today, 1);
  const weekStart = startOfWeekKey(today);
  const month = studioMonthRange(today);

  const [studio, week, sales, monthPayments, recent, tomorrowBookings, counts, receiptsToReview, pendingAttendance] = await Promise.all([
    prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { businessName: true, slug: true, paginaPublicaActiva: true }
    }),
    listClassSessions(clientId, weekStart, addDaysToKey(weekStart, 6)),
    prisma.memberPackage.findMany({
      where: { clientId, anuladoAt: null, member: { deletedAt: null } },
      include: memberPackageInclude
    }),
    prisma.memberPackagePayment.aggregate({
      where: { clientId, anuladoAt: null, memberPackage: { anuladoAt: null }, fecha: { gte: month.from, lt: month.to } },
      _sum: { monto: true }
    }),
    prisma.booking.findMany({
      where: { clientId, origen: "PUBLICO", member: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        estado: true,
        createdAt: true,
        member: { select: { id: true, nombre: true, apellido: true } },
        session: { select: { fecha: true, horaInicio: true, schedule: { select: { discipline: { select: { nombre: true, color: true } } } } } }
      }
    }),
    prisma.booking.count({
      where: { clientId, estado: "RESERVADA", session: { fecha: dateKeyToDate(tomorrow), cancelada: false } }
    }),
    Promise.all([
      prisma.discipline.count({ where: { clientId, deletedAt: null } }),
      prisma.classSchedule.count({ where: { clientId, deletedAt: null } }),
      prisma.package.count({ where: { clientId, deletedAt: null } })
    ]),
    prisma.paymentReceipt.count({ where: { clientId, estado: "POR_REVISAR" } }),
    getPendingAttendance(clientId, instant)
  ]);

  const activeWeek = week.filter((session) => !session.cancelada);
  const todaySessions = week.filter((session) => session.fecha === today);
  const activeToday = todaySessions.filter((session) => !session.cancelada);
  const weekSpots = activeWeek.reduce((sum, session) => sum + session.cupo, 0);
  const weekBooked = activeWeek.reduce((sum, session) => sum + session.reservadas, 0);

  const views = sales.map((sale) => serializeMemberPackage(sale, today));
  const [disciplines, schedules, packages] = counts;

  return {
    today,
    studio,
    clasesHoy: activeToday.length,
    reservasHoy: activeToday.reduce((sum, session) => sum + session.reservadas, 0),
    ocupacionSemana: weekSpots ? Math.round((weekBooked / weekSpots) * 100) : null,
    ingresosMes: Number(monthPayments._sum.monto ?? 0),
    porCobrar: views.reduce((sum, view) => sum + view.saldo, 0),
    clasesDeHoy: todaySessions.map((session) => ({
      key: session.key,
      horaInicio: session.horaInicio,
      horaFin: session.horaFin,
      cupo: session.cupo,
      reservadas: session.reservadas,
      cancelada: session.cancelada,
      instructor: session.instructor,
      discipline: session.discipline
    })),
    atender: {
      porVencer: views.filter((view) => (view.porVencer || view.pocasClases) && !view.renovadoPor).length,
      conSaldo: new Set(views.filter((view) => view.saldo > 0).map((view) => view.memberId)).size,
      // Spec 020 R10.
      saldosVencidos: views.filter((view) => view.saldoVencido).length,
      vencidosSemana: expiredWithoutRenewal(views, 7).length,
      recordatoriosManana: tomorrowBookings,
      comprobantes: receiptsToReview,
      // Spec 019 R10: clases que ya terminaron con reservas sin marcar.
      asistenciaPendiente: pendingAttendance.length
    },
    vigentes: views.filter((view) => view.estado === "ACTIVO").length,
    recientes: recent.map((booking) => ({
      id: booking.id,
      estado: booking.estado,
      createdAt: booking.createdAt.toISOString(),
      member: booking.member,
      fecha: dateToDateKey(booking.session.fecha),
      horaInicio: booking.session.horaInicio,
      discipline: booking.session.schedule.discipline
    })),
    pasos: {
      disciplinas: disciplines > 0,
      paquetes: packages > 0,
      horario: schedules > 0,
      pagina: Boolean(studio.slug && studio.paginaPublicaActiva)
    }
  };
}

export type StudioDashboardData = Awaited<ReturnType<typeof getStudioDashboard>>;
