import type { BookingStatus } from "@prisma/client";
import { consumeClass, refundClass } from "@/lib/bookings";
import { listClassSessions } from "@/lib/class-sessions";
import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { addDaysToKey, addMinutesToTimeKey, dateKeyToDate, dateToDateKey, studioNow, timeKeyToMinutes } from "@/lib/studio-time";

// Asistencia de las clases del estudio (spec 019). La clase ya se desconto al
// reservar (D3); aqui se registra que paso y se aplica la politica de inasistencia (D4).

export const PENDING_ATTENDANCE_DAYS = 14;

type AttendanceState = Extract<BookingStatus, "RESERVADA" | "ASISTIO" | "NO_ASISTIO">;

/**
 * Spec 019 R7 / D4. La devolucion se guia por `claseDevuelta`, no por la
 * politica actual: si el estudio cambia la politica, desmarcar una inasistencia
 * que ya devolvio la clase la vuelve a descontar igual.
 */
export async function setAttendance(clientId: string, bookingId: string, estado: AttendanceState, instant = new Date()) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, clientId },
      include: { session: { select: { fecha: true } }, client: { select: { devolverClaseInasistencia: true } } }
    });
    if (!booking || booking.estado === "CANCELADA") throw new ApiError(404, "Reserva no encontrada o cancelada");
    if (estado !== "RESERVADA" && dateToDateKey(booking.session.fecha) > studioNow(instant).dateKey) {
      throw new ApiError(422, "La asistencia se marca el día de la clase o después");
    }

    let claseDevuelta = booking.claseDevuelta;
    if (estado === "NO_ASISTIO" && booking.estado !== "NO_ASISTIO" && booking.client.devolverClaseInasistencia && !claseDevuelta) {
      await refundClass(tx, booking.memberPackageId);
      claseDevuelta = true;
    } else if (estado !== "NO_ASISTIO" && booking.estado === "NO_ASISTIO" && claseDevuelta) {
      // Vuelve a contar como clase usada; si el plan ya no tiene, no se puede.
      await consumeClass(tx, booking.memberPackageId);
      claseDevuelta = false;
    }

    // updateMany condicionado: dos marcas a la vez no devuelven ni descuentan dos veces.
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, estado: booking.estado, claseDevuelta: booking.claseDevuelta },
      data: { estado, claseDevuelta, asistenciaAt: estado === "RESERVADA" ? null : instant }
    });
    if (count === 0) throw new ApiError(409, "La reserva cambió mientras tanto; recarga e intenta de nuevo");
    return { estado, claseDevuelta, devuelta: claseDevuelta && !booking.claseDevuelta };
  });
}

/** Spec 019 R7: "Todos asistieron" marca a quienes siguen sin marcar. */
export async function markAllAttended(clientId: string, scheduleId: string, fecha: string, instant = new Date()) {
  if (fecha > studioNow(instant).dateKey) throw new ApiError(422, "La asistencia se marca el día de la clase o después");
  const { count } = await prisma.booking.updateMany({
    where: { clientId, estado: "RESERVADA", session: { scheduleId, fecha: dateKeyToDate(fecha) } },
    data: { estado: "ASISTIO", asistenciaAt: instant }
  });
  return { marcadas: count };
}

const attendanceBookingSelect = {
  id: true,
  estado: true,
  claseDevuelta: true,
  sinReserva: true,
  origen: true,
  asistenciaAt: true,
  member: { select: { id: true, nombre: true, apellido: true, celular: true } },
  memberPackage: {
    select: { id: true, nombre: true, clases: true, clasesUsadas: true, discipline: { select: { nombre: true, color: true } } }
  }
} as const;

/** Spec 019 R7: las clases de un dia con su lista para tomar asistencia. */
export async function getAttendanceDay(clientId: string, fecha: string, instant = new Date()) {
  const sessions = (await listClassSessions(clientId, fecha, fecha)).filter((session) => !session.cancelada);
  const ids = sessions.map((session) => session.sessionId).filter((id): id is string => Boolean(id));
  const bookings = ids.length
    ? await prisma.booking.findMany({
        where: { clientId, sessionId: { in: ids }, estado: { not: "CANCELADA" } },
        select: { ...attendanceBookingSelect, sessionId: true },
        orderBy: [{ createdAt: "asc" }]
      })
    : [];
  const now = studioNow(instant);

  return sessions.map((session) => {
    const list = bookings.filter((booking) => booking.sessionId === session.sessionId);
    return {
      ...session,
      empezo: fecha < now.dateKey || (fecha === now.dateKey && timeKeyToMinutes(session.horaInicio) <= now.minutes),
      bookings: list.map(({ sessionId: _sessionId, memberPackage, asistenciaAt, ...booking }) => ({
        ...booking,
        asistenciaAt: asistenciaAt?.toISOString() ?? null,
        memberPackage: {
          id: memberPackage.id,
          nombre: memberPackage.nombre,
          discipline: memberPackage.discipline,
          clases: memberPackage.clases,
          clasesRestantes: Math.max(memberPackage.clases - memberPackage.clasesUsadas, 0)
        }
      }))
    };
  });
}

export type AttendanceSession = Awaited<ReturnType<typeof getAttendanceDay>>[number];

/** Spec 019 R10: clases que ya terminaron con reservas sin marcar (ultimos 14 dias). */
export async function getPendingAttendance(clientId: string, instant = new Date()) {
  const now = studioNow(instant);
  const from = addDaysToKey(now.dateKey, -PENDING_ATTENDANCE_DAYS);
  const rows = await prisma.booking.findMany({
    where: {
      clientId,
      estado: "RESERVADA",
      session: { cancelada: false, fecha: { gte: dateKeyToDate(from), lte: dateKeyToDate(now.dateKey) } }
    },
    select: {
      session: {
        select: { scheduleId: true, fecha: true, horaInicio: true, duracionMin: true, schedule: { select: { discipline: { select: { nombre: true, color: true } } } } }
      }
    }
  });

  const groups = new Map<string, { scheduleId: string; fecha: string; horaInicio: string; discipline: { nombre: string; color: string }; pendientes: number }>();
  for (const { session } of rows) {
    const fecha = dateToDateKey(session.fecha);
    const ends = timeKeyToMinutes(addMinutesToTimeKey(session.horaInicio, session.duracionMin));
    if (fecha === now.dateKey && ends > now.minutes) continue; // aun no termina
    const key = `${session.scheduleId}|${fecha}`;
    const current = groups.get(key);
    if (current) current.pendientes += 1;
    else groups.set(key, { scheduleId: session.scheduleId, fecha, horaInicio: session.horaInicio, discipline: session.schedule.discipline, pendientes: 1 });
  }
  return [...groups.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.horaInicio.localeCompare(a.horaInicio));
}

export type PendingAttendance = Awaited<ReturnType<typeof getPendingAttendance>>[number];

/** Spec 019 R9: las clases de un cliente, para su ficha. */
export async function getMemberClassHistory(clientId: string, memberId: string) {
  const rows = await prisma.booking.findMany({
    where: { clientId, memberId },
    select: {
      id: true,
      estado: true,
      claseDevuelta: true,
      sinReserva: true,
      memberPackageId: true,
      session: {
        select: { fecha: true, horaInicio: true, schedule: { select: { discipline: { select: { nombre: true, color: true } } } } }
      }
    },
    orderBy: [{ session: { fecha: "desc" } }, { session: { horaInicio: "desc" } }]
  });
  return rows.map(({ session, ...row }) => ({
    ...row,
    fecha: dateToDateKey(session.fecha),
    horaInicio: session.horaInicio,
    discipline: session.schedule.discipline
  }));
}

export type ClassHistoryItem = Awaited<ReturnType<typeof getMemberClassHistory>>[number];
