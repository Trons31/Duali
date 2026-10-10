import { listClassSessions } from "@/lib/class-sessions";
import { serializeMemberPackage, memberPackageInclude } from "@/lib/member-packages";
import { queueNotification } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { digestBody, formatShortDateKey, money } from "@/lib/studio-messages";
import { dateToDateKey, formatTimeKey, studioNow } from "@/lib/studio-time";

// Push a la duena del estudio (spec 011 R1–R3), sobre la cola existente.

export const DIGEST_FROM_MINUTES = 6 * 60;

async function bookingSummary(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      clientId: true,
      accessToken: true,
      claseDevuelta: true,
      member: { select: { id: true, nombre: true, apellido: true } },
      memberPackage: { select: { precio: true, pagado: true } },
      session: { select: { fecha: true, horaInicio: true, schedule: { select: { discipline: { select: { nombre: true } } } } } }
    }
  });
}

function describeClass(booking: NonNullable<Awaited<ReturnType<typeof bookingSummary>>>) {
  const fecha = dateToDateKey(booking.session.fecha);
  return `${booking.session.schedule.discipline.nombre} ${formatShortDateKey(fecha)}, ${formatTimeKey(booking.session.horaInicio)}`;
}

/**
 * Best-effort: la reserva ya quedo hecha; si encolar falla solo se registra.
 * El dedupKey usa el token de la reserva web, que es nuevo en cada reserva.
 */
export async function notifyPublicBooking(bookingId: string) {
  try {
    const booking = await bookingSummary(bookingId);
    if (!booking?.accessToken) return;
    const saldo = Math.max(Number(booking.memberPackage.precio) - Number(booking.memberPackage.pagado), 0);
    await queueNotification({
      clientId: booking.clientId,
      type: "STUDIO_BOOKING",
      dedupKey: `studio-booking:${booking.accessToken}`,
      title: `${booking.member.nombre} apartó cupo`,
      body: `${describeClass(booking)}${saldo > 0 ? ` · debe ${money(saldo)}` : ""}`,
      data: { type: "STUDIO_BOOKING", href: `/dashboard/clientes/${booking.member.id}`, bookingId }
    });
  } catch (error) {
    console.error("No se pudo avisar la reserva web", error);
  }
}

export async function notifyPublicCancellation(bookingId: string) {
  try {
    const booking = await bookingSummary(bookingId);
    if (!booking?.accessToken) return;
    await queueNotification({
      clientId: booking.clientId,
      type: "STUDIO_BOOKING_CANCELLED",
      dedupKey: `studio-cancel:${booking.accessToken}`,
      title: `${booking.member.nombre} canceló`,
      body: `${describeClass(booking)} · ${booking.claseDevuelta ? "recuperó la clase" : "fuera de plazo, no recupera la clase"}`,
      data: { type: "STUDIO_BOOKING_CANCELLED", href: `/dashboard/clientes/${booking.member.id}`, bookingId }
    });
  } catch (error) {
    console.error("No se pudo avisar la cancelación web", error);
  }
}

/**
 * Spec 011 R3: un resumen al dia por negocio con modulo Estudio, desde las 6:00
 * de Bogota. El dedupKey lleva la fecha: el cron puede correr cada minuto.
 */
export async function queueStudioDigests(options: { deadline?: number; instant?: Date; clientIds?: string[] } = {}) {
  const now = studioNow(options.instant);
  const result = { queued: 0, deduped: 0, skipped: 0, timedOut: false };
  if (now.minutes < DIGEST_FROM_MINUTES) return result;

  const clients = await prisma.client.findMany({
    where: { deletedAt: null, moduloEstudio: true, ...(options.clientIds ? { id: { in: options.clientIds } } : {}) },
    select: { id: true }
  });
  const already = new Set(
    (
      await prisma.notification.findMany({
        where: { dedupKey: { in: clients.map((client) => `studio-digest:${client.id}:${now.dateKey}`) } },
        select: { dedupKey: true }
      })
    ).map((row) => row.dedupKey)
  );

  for (const client of clients) {
    if (options.deadline && Date.now() >= options.deadline) {
      result.timedOut = true;
      break;
    }
    const dedupKey = `studio-digest:${client.id}:${now.dateKey}`;
    if (already.has(dedupKey)) {
      result.deduped += 1;
      continue;
    }

    const [sessions, sales] = await Promise.all([
      listClassSessions(client.id, now.dateKey, now.dateKey),
      prisma.memberPackage.findMany({
        where: { clientId: client.id, anuladoAt: null, member: { deletedAt: null } },
        include: memberPackageInclude
      })
    ]);
    const active = sessions.filter((session) => !session.cancelada);
    const views = sales.map((sale) => serializeMemberPackage(sale, now.dateKey));
    const summary = {
      clases: active.length,
      reservas: active.reduce((sum, session) => sum + session.reservadas, 0),
      porVencer: views.filter((view) => view.porVencer || view.pocasClases).length,
      porCobrar: views.reduce((sum, view) => sum + view.saldo, 0)
    };
    if (!summary.clases && !summary.porVencer && !summary.porCobrar) {
      result.skipped += 1;
      continue;
    }

    const queued = await queueNotification({
      clientId: client.id,
      type: "STUDIO_DIGEST",
      dedupKey,
      title: "Tu día en el estudio",
      body: digestBody(summary),
      data: { type: "STUDIO_DIGEST", href: summary.clases ? "/dashboard/horario" : "/dashboard/avisos" }
    });
    if (queued.deduped) result.deduped += 1;
    else result.queued += 1;
  }

  return result;
}
