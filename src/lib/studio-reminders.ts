import type { StudioMessageType } from "@prisma/client";
import { memberPackageInclude, serializeMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import {
  balanceMessage,
  cancelledClassMessage,
  classReminderMessage,
  expiringPackageMessage,
  formatDayMonth,
  waitlistSpotMessage,
  whatsappHref
} from "@/lib/studio-messages";
import { addDaysToKey, dateKeyToDate, dateToDateKey, formatTimeKey, studioNow } from "@/lib/studio-time";

// Avisos por WhatsApp que la duena envia con un toque (spec 011 R4–R6). El texto
// y el enlace se arman aqui, en el servidor, para que sean iguales en todos lados.

export type ReminderItem = {
  tipo: StudioMessageType;
  refKey: string;
  member: { id: string; nombre: string; apellido: string | null; celular: string };
  detalle: string;
  mensaje: string;
  href: string;
  enviadoAt: string | null;
};

type Studio = {
  businessName: string;
  slug: string | null;
  paginaPublicaActiva: boolean;
  paymentMethodItems: unknown;
};

function pageUrl(studio: Studio, baseUrl?: string) {
  return baseUrl && studio.slug && studio.paginaPublicaActiva ? `${baseUrl}/s/${studio.slug}` : null;
}

function paymentMethods(studio: Studio) {
  return Array.isArray(studio.paymentMethodItems)
    ? (studio.paymentMethodItems as Array<{ name?: unknown; account?: unknown }>).map((item) => ({
        name: String(item?.name ?? ""),
        account: String(item?.account ?? "")
      }))
    : [];
}

async function sentMap(clientId: string, keys: Array<{ tipo: StudioMessageType; refKey: string }>) {
  if (!keys.length) return new Map<string, Date>();
  const rows = await prisma.studioMessage.findMany({
    where: { clientId, OR: keys.map((key) => ({ tipo: key.tipo, refKey: key.refKey })) },
    select: { tipo: true, refKey: true, sentAt: true }
  });
  return new Map(rows.map((row) => [`${row.tipo}|${row.refKey}`, row.sentAt]));
}

function withSent(items: Omit<ReminderItem, "enviadoAt">[], sent: Map<string, Date>): ReminderItem[] {
  return items.map((item) => ({ ...item, enviadoAt: sent.get(`${item.tipo}|${item.refKey}`)?.toISOString() ?? null }));
}

/** Spec 011 R4: reservas de manana, paquetes por vencer y saldos pendientes. */
export async function getStudioReminders(clientId: string, options: { baseUrl?: string; instant?: Date } = {}) {
  const today = studioNow(options.instant).dateKey;
  const tomorrow = addDaysToKey(today, 1);
  const studio = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    select: { businessName: true, slug: true, paginaPublicaActiva: true, paymentMethodItems: true, horasCancelacion: true }
  });
  const url = pageUrl(studio, options.baseUrl);

  const [bookings, sales, spots] = await Promise.all([
    prisma.booking.findMany({
      where: {
        clientId,
        estado: "RESERVADA",
        member: { deletedAt: null },
        session: { fecha: dateKeyToDate(tomorrow), cancelada: false }
      },
      select: {
        id: true,
        member: { select: { id: true, nombre: true, apellido: true, celular: true } },
        session: { select: { fecha: true, horaInicio: true, schedule: { select: { discipline: { select: { nombre: true } } } } } }
      },
      orderBy: [{ session: { horaInicio: "asc" } }]
    }),
    prisma.memberPackage.findMany({
      where: { clientId, anuladoAt: null, member: { deletedAt: null } },
      include: { ...memberPackageInclude, member: { select: { id: true, nombre: true, apellido: true, celular: true } } },
      orderBy: [{ vence: "asc" }]
    }),
    // Spec 015 R5: cupos que llegaron de la lista de espera, de clases que aun no pasan.
    prisma.waitlistEntry.findMany({
      where: {
        clientId,
        estado: "ASIGNADA",
        member: { deletedAt: null },
        session: { fecha: { gte: dateKeyToDate(today) }, cancelada: false }
      },
      select: { bookingId: true },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  const spotBookings = await prisma.booking.findMany({
    where: { id: { in: spots.map((spot) => spot.bookingId).filter((id): id is string => Boolean(id)) }, estado: "RESERVADA" },
    select: {
      id: true,
      accessToken: true,
      member: { select: { id: true, nombre: true, apellido: true, celular: true } },
      memberPackage: { select: { precio: true, pagado: true } },
      session: { select: { fecha: true, horaInicio: true, schedule: { select: { discipline: { select: { nombre: true } } } } } }
    },
    orderBy: [{ session: { fecha: "asc" } }, { session: { horaInicio: "asc" } }]
  });

  const manana = bookings.map((booking) => {
    const fecha = dateToDateKey(booking.session.fecha);
    const disciplina = booking.session.schedule.discipline.nombre;
    const mensaje = classReminderMessage({
      businessName: studio.businessName,
      nombre: booking.member.nombre,
      disciplina,
      fecha,
      horaInicio: booking.session.horaInicio,
      pageUrl: url
    });
    return {
      tipo: "RECORDATORIO_CLASE" as const,
      refKey: booking.id,
      member: booking.member,
      detalle: `${disciplina} · ${formatTimeKey(booking.session.horaInicio)}`,
      mensaje,
      href: whatsappHref(booking.member.celular, mensaje)
    };
  });

  const views = sales.map((sale) => ({ sale, view: serializeMemberPackage(sale, today) }));

  // El refKey lleva el vencimiento y las clases: si extiende o reserva, vuelve a aparecer como pendiente.
  const porVencer = views
    .filter(({ view }) => view.porVencer || view.pocasClases)
    .map(({ sale, view }) => {
      const mensaje = expiringPackageMessage({
        businessName: studio.businessName,
        nombre: sale.member.nombre,
        paquete: view.nombre,
        disciplina: view.discipline.nombre,
        clasesRestantes: view.clasesRestantes,
        vence: view.vence,
        pageUrl: url
      });
      return {
        tipo: "PAQUETE_POR_VENCER" as const,
        refKey: `${sale.id}:${view.vence}:${view.clasesRestantes}`,
        member: sale.member,
        detalle: `${view.nombre} ${view.discipline.nombre} · ${view.clasesRestantes} clase${view.clasesRestantes === 1 ? "" : "s"} · vence ${formatDayMonth(view.vence)}`,
        mensaje,
        href: whatsappHref(sale.member.celular, mensaje)
      };
    });

  const saldos = views
    .filter(({ view }) => view.saldo > 0)
    .map(({ sale, view }) => {
      const mensaje = balanceMessage({
        businessName: studio.businessName,
        nombre: sale.member.nombre,
        paquete: view.nombre,
        disciplina: view.discipline.nombre,
        saldo: view.saldo,
        paymentMethods: paymentMethods(studio)
      });
      return {
        tipo: "SALDO" as const,
        refKey: `${sale.id}:${view.saldo}`,
        member: sale.member,
        detalle: `${view.nombre} ${view.discipline.nombre} · debe $${view.saldo.toLocaleString("es-CO")}`,
        mensaje,
        href: whatsappHref(sale.member.celular, mensaje)
      };
    });

  const listaEspera = spotBookings.map((booking) => {
    const fecha = dateToDateKey(booking.session.fecha);
    const disciplina = booking.session.schedule.discipline.nombre;
    const mensaje = waitlistSpotMessage({
      businessName: studio.businessName,
      nombre: booking.member.nombre,
      disciplina,
      fecha,
      horaInicio: booking.session.horaInicio,
      saldo: Math.max(Number(booking.memberPackage.precio) - Number(booking.memberPackage.pagado), 0),
      horasCancelacion: studio.horasCancelacion,
      bookingUrl:
        options.baseUrl && studio.slug && booking.accessToken ? `${options.baseUrl}/s/${studio.slug}/reserva/${booking.accessToken}` : null
    });
    return {
      tipo: "CUPO_LISTA_ESPERA" as const,
      refKey: booking.id,
      member: booking.member,
      detalle: `${disciplina} · ${formatDayMonth(fecha)}, ${formatTimeKey(booking.session.horaInicio)}`,
      mensaje,
      href: whatsappHref(booking.member.celular, mensaje)
    };
  });

  const sent = await sentMap(clientId, [...manana, ...porVencer, ...saldos, ...listaEspera]);
  return {
    manana: withSent(manana, sent),
    porVencer: withSent(porVencer, sent),
    saldos: withSent(saldos, sent),
    listaEspera: withSent(listaEspera, sent)
  };
}

/** Spec 011 R5: avisos para las reservas de una clase cancelada. */
export async function getCancelledClassReminders(
  clientId: string,
  scheduleId: string,
  fecha: string,
  options: { baseUrl?: string } = {}
) {
  const session = await prisma.classSession.findFirst({
    where: { clientId, scheduleId, fecha: dateKeyToDate(fecha), cancelada: true },
    select: {
      horaInicio: true,
      motivoCancelacion: true,
      schedule: { select: { discipline: { select: { nombre: true } } } },
      client: { select: { businessName: true, slug: true, paginaPublicaActiva: true, paymentMethodItems: true } },
      bookings: {
        where: { estado: "CANCELADA", claseDevuelta: true, member: { deletedAt: null } },
        select: { id: true, member: { select: { id: true, nombre: true, apellido: true, celular: true } } }
      }
    }
  });
  if (!session) return [];

  const items = session.bookings.map((booking) => {
    const mensaje = cancelledClassMessage({
      businessName: session.client.businessName,
      nombre: booking.member.nombre,
      disciplina: session.schedule.discipline.nombre,
      fecha,
      horaInicio: session.horaInicio,
      motivo: session.motivoCancelacion,
      pageUrl: pageUrl(session.client, options.baseUrl)
    });
    return {
      tipo: "CLASE_CANCELADA" as const,
      refKey: booking.id,
      member: booking.member,
      detalle: session.schedule.discipline.nombre,
      mensaje,
      href: whatsappHref(booking.member.celular, mensaje)
    };
  });
  return withSent(items, await sentMap(clientId, items));
}
