import { countActiveBookings, createBooking, findSellablePackages, findUsablePackages, lockSession } from "@/lib/bookings";
import { ensureClassSession } from "@/lib/class-sessions";
import { ApiError } from "@/lib/http";
import { queueNotification } from "@/lib/notification-queue";
import {
  ensurePublicMember,
  newAccessToken,
  preparePublicRequest,
  type PublicBookingInput
} from "@/lib/public-studio";
import { prisma } from "@/lib/prisma";
import { formatShortDateKey } from "@/lib/studio-messages";
import { dateKeyToDate, dateToDateKey, formatTimeKey, isBeforeCancellationDeadline, studioNow, timeKeyToMinutes } from "@/lib/studio-time";

// Lista de espera de una clase llena (spec 015).

export const MAX_WAITLIST = 10;

const FULL_MESSAGE = "Sin cupos en esta clase";

async function positionOf(entry: { sessionId: string; createdAt: Date }) {
  return prisma.waitlistEntry.count({
    where: { sessionId: entry.sessionId, estado: "EN_ESPERA", createdAt: { lte: entry.createdAt } }
  });
}

/** Spec 015 R1: anotarse desde la pagina publica, con las mismas reglas de una reserva web. */
export async function joinWaitlist(slug: string, input: PublicBookingInput, instant = new Date()) {
  const { studio, schedule, celular, needsPackage, ...prepared } = await preparePublicRequest(slug, input, instant);

  // Antes de pedir el plan: si hay cupo o la clase se cancelo, la lista no aplica.
  const stored = await prisma.classSession.findUnique({
    where: { scheduleId_fecha: { scheduleId: input.scheduleId, fecha: dateKeyToDate(input.fecha) } },
    select: { id: true, cupo: true, cancelada: true }
  });
  if (stored?.cancelada) throw new ApiError(409, "La clase está cancelada");
  const booked = stored ? await countActiveBookings(prisma, stored.id) : 0;
  if (booked < (stored?.cupo ?? schedule.cupo)) throw new ApiError(409, "Esta clase tiene cupos: aparta el tuyo directamente");

  if (needsPackage) return needsPackage;
  const member = await ensurePublicMember(studio.id, celular, input, prepared.member);
  const accessToken = newAccessToken();

  const entry = await prisma.$transaction(async (tx) => {
    const session = await ensureClassSession(studio.id, input.scheduleId, input.fecha, tx);
    await lockSession(tx, session.id);
    const current = await tx.classSession.findUniqueOrThrow({ where: { id: session.id }, select: { cupo: true, cancelada: true } });
    if (current.cancelada) throw new ApiError(409, "La clase está cancelada");
    if ((await countActiveBookings(tx, session.id)) < current.cupo) {
      throw new ApiError(409, "Se liberó un cupo: aparta el tuyo directamente");
    }

    const booking = await tx.booking.findUnique({
      where: { sessionId_memberId: { sessionId: session.id, memberId: member.id } },
      select: { estado: true }
    });
    if (booking && booking.estado !== "CANCELADA") throw new ApiError(409, "Ya tienes un cupo en esta clase");

    const existing = await tx.waitlistEntry.findUnique({
      where: { sessionId_memberId: { sessionId: session.id, memberId: member.id } },
      select: { id: true, estado: true }
    });
    if (existing?.estado === "EN_ESPERA") throw new ApiError(409, "Ya estás en la lista de espera de esta clase");
    if ((await tx.waitlistEntry.count({ where: { sessionId: session.id, estado: "EN_ESPERA" } })) >= MAX_WAITLIST) {
      throw new ApiError(409, "La lista de espera de esta clase está llena");
    }

    // Quien salio y vuelve a anotarse queda al final, con un enlace nuevo.
    const data = { estado: "EN_ESPERA" as const, accessToken, packageId: input.packageId ?? null, bookingId: null, createdAt: new Date() };
    return existing
      ? tx.waitlistEntry.update({ where: { id: existing.id }, data })
      : tx.waitlistEntry.create({ data: { ...data, clientId: studio.id, sessionId: session.id, memberId: member.id } });
  });

  return { estado: "EN_ESPERA" as const, accessToken, posicion: await positionOf(entry) };
}

type EntryForAssign = {
  id: string;
  clientId: string;
  memberId: string;
  packageId: string | null;
  session: { scheduleId: string; fecha: Date; schedule: { disciplineId: string } };
};

const assignSelect = {
  id: true,
  clientId: true,
  memberId: true,
  packageId: true,
  session: { select: { scheduleId: true, fecha: true, schedule: { select: { disciplineId: true } } } }
} as const;

/**
 * Spec 015 W2: reserva con las reglas de siempre. Con plan vigente se descuenta
 * de el; si no, se vende sin pago el plan que eligio al anotarse.
 */
async function assignEntry(entry: EntryForAssign) {
  const fecha = dateToDateKey(entry.session.fecha);
  const usable = await findUsablePackages(prisma, {
    clientId: entry.clientId,
    memberId: entry.memberId,
    disciplineId: entry.session.schedule.disciplineId,
    fecha
  });
  let venta: { packageId: string } | undefined;
  if (!usable.length) {
    const sellable = entry.packageId
      ? await findSellablePackages(entry.clientId, entry.session.schedule.disciplineId, { onlyPublic: true })
      : [];
    if (!sellable.some((item) => item.id === entry.packageId)) {
      throw new ApiError(422, "Ya no tiene un plan válido para esta clase");
    }
    venta = { packageId: entry.packageId! };
  }

  // createBooking marca la entrada como ASIGNADA en la misma transaccion.
  return createBooking({
    clientId: entry.clientId,
    scheduleId: entry.session.scheduleId,
    fecha,
    memberId: entry.memberId,
    origen: "PUBLICO",
    accessToken: newAccessToken(),
    ...(venta ? { venta } : {})
  });
}

/** Spec 015 R4: "Dar cupo" desde el panel, sin importar el plazo. */
export async function assignWaitlistEntry(clientId: string, id: string) {
  const entry = await prisma.waitlistEntry.findFirst({ where: { id, clientId }, select: { ...assignSelect, estado: true } });
  if (!entry) throw new ApiError(404, "No está en la lista de espera");
  if (entry.estado !== "EN_ESPERA") throw new ApiError(409, "Ya no está en la lista de espera");
  return assignEntry(entry);
}

export async function removeWaitlistEntry(where: { id: string; clientId: string } | { accessToken: string }) {
  const { count } = await prisma.waitlistEntry.updateMany({ where: { ...where, estado: "EN_ESPERA" }, data: { estado: "SALIO" } });
  if (count > 0) return;
  if (!(await prisma.waitlistEntry.findFirst({ where, select: { id: true } }))) throw new ApiError(404, "No está en la lista de espera");
  throw new ApiError(409, "Ya no está en la lista de espera");
}

/**
 * Spec 015 R3: al liberarse un cupo, pasa solo a la primera de la lista si la
 * clase aun esta antes del plazo de cancelacion (W1). Best-effort: la accion que
 * libero el cupo ya quedo hecha; si algo falla aqui solo se registra.
 */
export async function fillFromWaitlist(sessionId: string, instant = new Date()) {
  try {
    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      select: {
        clientId: true,
        fecha: true,
        horaInicio: true,
        cupo: true,
        cancelada: true,
        client: { select: { horasCancelacion: true } },
        schedule: { select: { discipline: { select: { nombre: true } } } }
      }
    });
    if (!session || session.cancelada) return 0;

    const waiting = await prisma.waitlistEntry.findMany({
      where: { sessionId, estado: "EN_ESPERA" },
      orderBy: { createdAt: "asc" },
      select: { ...assignSelect, member: { select: { id: true, nombre: true } } }
    });
    if (!waiting.length) return 0;
    const free = session.cupo - (await countActiveBookings(prisma, sessionId));
    if (free <= 0) return 0;

    const fecha = dateToDateKey(session.fecha);
    const now = studioNow(instant);
    if (fecha < now.dateKey || (fecha === now.dateKey && timeKeyToMinutes(session.horaInicio) <= now.minutes)) return 0;
    const clase = `${session.schedule.discipline.nombre} ${formatShortDateKey(fecha)}, ${formatTimeKey(session.horaInicio)}`;

    if (!isBeforeCancellationDeadline(fecha, session.horaInicio, session.client.horasCancelacion, instant)) {
      // Pasado el plazo decide la duena (W1).
      await notify({
        clientId: session.clientId,
        type: "STUDIO_WAITLIST_FREE",
        dedupKey: `studio-waitlist-free:${sessionId}:${instant.toISOString().slice(0, 16)}`,
        title: "Se liberó un cupo",
        body: `${clase} · ${waiting.length} en lista de espera. Puedes darle el cupo desde el horario.`,
        data: { type: "STUDIO_WAITLIST_FREE", href: "/dashboard/horario" }
      });
      return 0;
    }

    let assigned = 0;
    for (const entry of waiting) {
      if (assigned >= free) break;
      try {
        await assignEntry(entry);
        assigned += 1;
        await notify({
          clientId: session.clientId,
          type: "STUDIO_WAITLIST_ASSIGNED",
          dedupKey: `studio-waitlist:${entry.id}`,
          title: `${entry.member.nombre} tomó un cupo de la lista de espera`,
          body: `${clase} · avísale por WhatsApp desde Avisos`,
          data: { type: "STUDIO_WAITLIST_ASSIGNED", href: "/dashboard/avisos" }
        });
      } catch (error) {
        if (error instanceof ApiError && error.message === FULL_MESSAGE) break;
        // Sin plan valido, ficha eliminada, etc.: sigue con la siguiente (W2).
        if (!(error instanceof ApiError)) console.error("No se pudo asignar el cupo de la lista de espera", error);
      }
    }
    return assigned;
  } catch (error) {
    console.error("No se pudo revisar la lista de espera", error);
    return 0;
  }
}

async function notify(input: Parameters<typeof queueNotification>[0]) {
  try {
    await queueNotification(input);
  } catch (error) {
    console.error("No se pudo avisar la lista de espera", error);
  }
}

/** Spec 015 R4: lista de una clase para el panel. */
export async function listSessionWaitlist(clientId: string, scheduleId: string, fecha: string) {
  const entries = await prisma.waitlistEntry.findMany({
    where: { clientId, estado: { in: ["EN_ESPERA", "ASIGNADA"] }, session: { scheduleId, fecha: dateKeyToDate(fecha) } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      estado: true,
      packageId: true,
      createdAt: true,
      member: { select: { id: true, nombre: true, apellido: true, celular: true } }
    }
  });
  const packageIds = [...new Set(entries.map((entry) => entry.packageId).filter((id): id is string => Boolean(id)))];
  const packages = packageIds.length
    ? await prisma.package.findMany({ where: { id: { in: packageIds }, clientId }, select: { id: true, nombre: true } })
    : [];
  const names = new Map(packages.map((item) => [item.id, item.nombre]));

  let position = 0;
  return entries.map((entry) => ({
    id: entry.id,
    estado: entry.estado,
    posicion: entry.estado === "EN_ESPERA" ? ++position : null,
    createdAt: entry.createdAt.toISOString(),
    member: entry.member,
    plan: entry.packageId ? (names.get(entry.packageId) ?? "Plan elegido") : null
  }));
}

export type WaitlistView = Awaited<ReturnType<typeof listSessionWaitlist>>[number];

/** Spec 015 R2: la entrada detras de un enlace privado, con lo justo para mostrarla. */
export async function getPublicWaitlistEntry(token: string, instant = new Date()) {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { accessToken: token },
    select: {
      sessionId: true,
      estado: true,
      createdAt: true,
      bookingId: true,
      member: { select: { nombre: true } },
      session: {
        select: {
          fecha: true,
          horaInicio: true,
          duracionMin: true,
          cancelada: true,
          schedule: { select: { instructor: true, discipline: { select: { nombre: true, color: true } } } }
        }
      },
      client: { select: { businessName: true, slug: true, telefono: true, horasCancelacion: true } }
    }
  });
  if (!entry) return null;

  const booking = entry.bookingId
    ? await prisma.booking.findUnique({ where: { id: entry.bookingId }, select: { accessToken: true } })
    : null;
  const fecha = dateToDateKey(entry.session.fecha);
  const now = studioNow(instant);

  return {
    estado: entry.estado,
    posicion: entry.estado === "EN_ESPERA" ? await positionOf(entry) : null,
    nombre: entry.member.nombre,
    reservaToken: booking?.accessToken ?? null,
    clase: {
      fecha,
      horaInicio: entry.session.horaInicio,
      duracionMin: entry.session.duracionMin,
      cancelada: entry.session.cancelada,
      empezo: fecha < now.dateKey || (fecha === now.dateKey && timeKeyToMinutes(entry.session.horaInicio) <= now.minutes),
      instructor: entry.session.schedule.instructor,
      discipline: entry.session.schedule.discipline
    },
    estudio: entry.client
  };
}

export type PublicWaitlistEntry = NonNullable<Awaited<ReturnType<typeof getPublicWaitlistEntry>>>;
