import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/http";
import { instructorName } from "@/lib/instructors";
import { prisma } from "@/lib/prisma";
import type { ExtendedTransactionClient } from "@/lib/prisma-types";
import {
  addMinutesToTimeKey,
  dateKeyToDate,
  dateToDateKey,
  eachDateKey,
  isoWeekday,
  studioTodayKey
} from "@/lib/studio-time";

// Clases del estudio (spec 005). Una clase de una fecha sale del horario fijo y
// solo se guarda en class_sessions cuando necesita datos propios.

const disciplineSelect = { id: true, nombre: true, color: true } as const;

export const classScheduleInclude = { discipline: { select: disciplineSelect } } as const;

/** Spec 005 R2: los horarios son de disciplinas tipo CLASE, propias y activas. */
export async function assertClassDiscipline(clientId: string, disciplineId: string) {
  const discipline = await prisma.discipline.findFirst({
    where: { id: disciplineId, clientId, deletedAt: null, activa: true },
    select: { tipo: true }
  });
  if (!discipline) throw new ApiError(422, "La disciplina no existe o está inactiva");
  if (discipline.tipo !== "CLASE") throw new ApiError(422, "Un combo no tiene horario propio; usa sus disciplinas");
}

export type ClassSessionView = {
  key: string;
  scheduleId: string;
  sessionId: string | null;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  duracionMin: number;
  cupo: number;
  reservadas: number;
  cancelada: boolean;
  motivoCancelacion: string | null;
  /** Spec 023 D5: quien la dicta (el reemplazo si hay uno). */
  instructor: string | null;
  instructorId: string | null;
  reemplazo: boolean;
  /** El titular del horario y su nombre, para mostrarlo junto al reemplazo. */
  titularId: string | null;
  titular: string | null;
  discipline: { id: string; nombre: string; color: string };
};

export function sessionKey(scheduleId: string, fecha: string) {
  return `${scheduleId}|${fecha}`;
}

export async function listClassSessions(clientId: string, from: string, to: string): Promise<ClassSessionView[]> {
  const [schedules, stored] = await Promise.all([
    prisma.classSchedule.findMany({
      where: { clientId, deletedAt: null, activo: true },
      include: { discipline: { select: disciplineSelect } }
    }),
    // Las guardadas salen aunque su horario ya este pausado o borrado: tienen
    // historia propia (cancelacion, cupo y, desde la spec 007, reservas).
    prisma.classSession.findMany({
      where: { clientId, fecha: { gte: dateKeyToDate(from), lte: dateKeyToDate(to) } },
      include: {
        schedule: { select: { instructor: true, instructorId: true, discipline: { select: disciplineSelect } } },
        reemplazo: { select: { id: true, nombre: true, apellido: true } }
      }
    })
  ]);

  const views = new Map<string, ClassSessionView>();
  const days = eachDateKey(from, to);

  for (const schedule of schedules) {
    // Un horario creado hoy no debe inventar clases en semanas pasadas.
    const createdKey = studioTodayKey(schedule.createdAt);
    for (const fecha of days) {
      if (isoWeekday(fecha) !== schedule.diaSemana || fecha < createdKey) continue;
      const key = sessionKey(schedule.id, fecha);
      views.set(key, {
        key,
        scheduleId: schedule.id,
        sessionId: null,
        fecha,
        horaInicio: schedule.horaInicio,
        horaFin: addMinutesToTimeKey(schedule.horaInicio, schedule.duracionMin),
        duracionMin: schedule.duracionMin,
        cupo: schedule.cupo,
        reservadas: 0,
        cancelada: false,
        motivoCancelacion: null,
        instructor: schedule.instructor,
        instructorId: schedule.instructorId,
        reemplazo: false,
        titularId: schedule.instructorId,
        titular: schedule.instructor,
        discipline: schedule.discipline
      });
    }
  }

  // Spec 007 R4: ocupacion real = reservas no canceladas.
  const counts = stored.length
    ? await prisma.booking.groupBy({
        by: ["sessionId"],
        where: { sessionId: { in: stored.map((session) => session.id) }, estado: { not: "CANCELADA" } },
        _count: { _all: true }
      })
    : [];
  const bookedBySession = new Map(counts.map((row) => [row.sessionId, row._count._all]));

  for (const session of stored) {
    const fecha = dateToDateKey(session.fecha);
    const key = sessionKey(session.scheduleId, fecha);
    views.set(key, {
      key,
      scheduleId: session.scheduleId,
      sessionId: session.id,
      fecha,
      horaInicio: session.horaInicio,
      horaFin: addMinutesToTimeKey(session.horaInicio, session.duracionMin),
      duracionMin: session.duracionMin,
      cupo: session.cupo,
      reservadas: bookedBySession.get(session.id) ?? 0,
      cancelada: session.cancelada,
      motivoCancelacion: session.motivoCancelacion,
      instructor: session.reemplazo ? instructorName(session.reemplazo) : session.schedule.instructor,
      instructorId: session.reemplazo?.id ?? session.schedule.instructorId,
      reemplazo: Boolean(session.reemplazo),
      titularId: session.schedule.instructorId,
      titular: session.schedule.instructor,
      discipline: session.schedule.discipline
    });
  }

  return [...views.values()].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio) || a.discipline.nombre.localeCompare(b.discipline.nombre, "es")
  );
}

/**
 * Devuelve la clase guardada de esa fecha, creandola desde el horario fijo si
 * aun no existe. La usan los ajustes por fecha y, en la spec 007, las reservas.
 */
export async function ensureClassSession(
  clientId: string,
  scheduleId: string,
  fecha: string,
  tx: ExtendedTransactionClient = prisma
) {
  const schedule = await tx.classSchedule.findFirst({ where: { id: scheduleId, clientId } });
  if (!schedule) throw new ApiError(404, "Horario no encontrado");

  const existing = await tx.classSession.findUnique({
    where: { scheduleId_fecha: { scheduleId, fecha: dateKeyToDate(fecha) } }
  });
  if (existing) return existing;

  if (schedule.deletedAt || !schedule.activo) throw new ApiError(409, "Ese horario ya no está activo");
  if (isoWeekday(fecha) !== schedule.diaSemana) throw new ApiError(422, "La fecha no corresponde al día del horario");

  // INSERT ... ON CONFLICT DO NOTHING: dos peticiones a la vez para la misma
  // fecha (p. ej. dos reservas) no chocan con el indice unico. El upsert de
  // Prisma no sirve aqui porque busca y luego crea, y en ese hueco se cruzan.
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "class_sessions" ("id", "clientId", "scheduleId", "fecha", "horaInicio", "duracionMin", "cupo", "updatedAt")
    VALUES (${randomUUID()}, ${clientId}, ${scheduleId}, ${fecha}::date, ${schedule.horaInicio},
            ${schedule.duracionMin}, ${schedule.cupo}, NOW())
    ON CONFLICT ("scheduleId", "fecha") DO NOTHING
  `);

  return tx.classSession.findUniqueOrThrow({
    where: { scheduleId_fecha: { scheduleId, fecha: dateKeyToDate(fecha) } }
  });
}
