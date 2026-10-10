import { Prisma } from "@prisma/client";
import { ensureClassSession } from "@/lib/class-sessions";
import { ApiError } from "@/lib/http";
import { sellMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import type { ExtendedTransactionClient } from "@/lib/prisma-types";
import { dateKeyToDate, dateToDateKey, isBeforeCancellationDeadline, studioNow } from "@/lib/studio-time";

// Reservas del estudio (spec 007). La clase se descuenta al reservar (D2).

const ACTIVE_STATES = ["RESERVADA", "ASISTIO", "NO_ASISTIO"] as const;

/** Paquetes vendidos que sirven para una disciplina: la misma o un combo que la incluya. */
function packageForDiscipline(disciplineId: string): Prisma.MemberPackageWhereInput {
  return {
    OR: [{ disciplineId }, { discipline: { tipo: "COMBO", comboItems: { some: { disciplineId } } } }]
  };
}

/** Vigentes para esa fecha, con clases disponibles; el que vence primero va primero. */
export async function findUsablePackages(
  tx: ExtendedTransactionClient,
  params: { clientId: string; memberId: string; disciplineId: string; fecha: string }
) {
  const fecha = dateKeyToDate(params.fecha);
  const candidates = await tx.memberPackage.findMany({
    where: {
      clientId: params.clientId,
      memberId: params.memberId,
      anuladoAt: null,
      inicio: { lte: fecha },
      vence: { gte: fecha },
      ...packageForDiscipline(params.disciplineId)
    },
    include: { discipline: { select: { nombre: true, color: true } } },
    orderBy: [{ vence: "asc" }, { createdAt: "asc" }]
  });

  // Prisma no compara dos columnas en el where: clasesUsadas < clases se filtra aqui.
  return candidates.filter((item) => item.clasesUsadas < item.clases);
}

/** Paquetes del catalogo que se pueden vender para reservar esa disciplina. */
export async function findSellablePackages(clientId: string, disciplineId: string, options: { onlyPublic?: boolean } = {}) {
  return prisma.package.findMany({
    where: {
      clientId,
      deletedAt: null,
      activo: true,
      ...(options.onlyPublic ? { visiblePublico: true } : {}),
      discipline: {
        deletedAt: null,
        activa: true,
        OR: [{ id: disciplineId }, { tipo: "COMBO", comboItems: { some: { disciplineId } } }]
      }
    },
    include: { discipline: { select: { nombre: true, color: true, tipo: true } } },
    orderBy: [{ clases: "asc" }, { precio: "asc" }]
  });
}

export async function lockSession(tx: ExtendedTransactionClient, sessionId: string) {
  // Bloquea la fila de la clase hasta terminar la transaccion: dos reservas por
  // el ultimo cupo se atienden una detras de otra y la segunda ve el cupo lleno.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "class_sessions" WHERE "id" = ${sessionId} FOR UPDATE`);
}

export async function countActiveBookings(tx: ExtendedTransactionClient, sessionId: string) {
  return tx.booking.count({ where: { sessionId, estado: { in: [...ACTIVE_STATES] } } });
}

export async function consumeClass(tx: ExtendedTransactionClient, memberPackageId: string) {
  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE "member_packages"
    SET "clasesUsadas" = "clasesUsadas" + 1, "updatedAt" = NOW()
    WHERE "id" = ${memberPackageId} AND "anuladoAt" IS NULL AND "clasesUsadas" < "clases"
  `);
  if (updated === 0) throw new ApiError(409, "El paquete ya no tiene clases disponibles");
}

export async function refundClass(tx: ExtendedTransactionClient, memberPackageId: string) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "member_packages"
    SET "clasesUsadas" = "clasesUsadas" - 1, "updatedAt" = NOW()
    WHERE "id" = ${memberPackageId} AND "clasesUsadas" > 0
  `);
}

type BookingInput = {
  clientId: string;
  scheduleId: string;
  fecha: string;
  memberId: string;
  memberPackageId?: string;
  origen?: "PANEL" | "PUBLICO";
  /** Enlace privado de la reserva web (spec 009). */
  accessToken?: string;
  /** Spec 019 R7: llego sin reservar; la reserva nace con asistencia. */
  llegoSinReservar?: boolean;
  venta?: {
    packageId: string;
    precio?: number;
    pago?: { monto: number; metodoPago: string };
    /** Spec 021: venta desde la pagina publica, con su enlace Mi plan y su comprobante. */
    origen?: "PANEL" | "PUBLICO";
    accessToken?: string;
    receipt?: { media: { url: string; publicId: string }; metodo: string };
  };
};

/** Spec 007 R1. */
export async function createBooking(input: BookingInput) {
  const today = studioNow().dateKey;
  if (input.llegoSinReservar) {
    // Se registra en la clase de hoy o en una pasada (si se olvido anotarla), nunca en una futura.
    if (input.fecha > today) throw new ApiError(422, "Solo se registra la llegada en clases de hoy o pasadas");
  } else if (input.fecha < today) {
    throw new ApiError(422, "No se puede reservar una clase pasada");
  }

  return prisma.$transaction(async (tx) => {
    const member = await tx.studioMember.findFirst({
      where: { id: input.memberId, clientId: input.clientId, deletedAt: null },
      select: { id: true }
    });
    if (!member) throw new ApiError(404, "Cliente no encontrado");

    const session = await ensureClassSession(input.clientId, input.scheduleId, input.fecha, tx);
    await lockSession(tx, session.id);

    const current = await tx.classSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { schedule: { select: { disciplineId: true } } }
    });
    if (current.cancelada) throw new ApiError(409, "La clase está cancelada");

    const existing = await tx.booking.findUnique({
      where: { sessionId_memberId: { sessionId: current.id, memberId: member.id } }
    });
    if (existing && existing.estado !== "CANCELADA") throw new ApiError(409, "Ya tiene un cupo en esta clase");

    if ((await countActiveBookings(tx, current.id)) >= current.cupo) throw new ApiError(409, "Sin cupos en esta clase");

    const disciplineId = current.schedule.disciplineId;
    let memberPackageId = input.memberPackageId;

    if (input.venta) {
      const sale = await sellMemberPackage(tx, {
        clientId: input.clientId,
        memberId: member.id,
        packageId: input.venta.packageId,
        precio: input.venta.precio,
        pago: input.venta.pago,
        origen: input.venta.origen,
        accessToken: input.venta.accessToken,
        // Una llegada registrada despues: la venta vale desde el dia de esa clase.
        inicio: input.llegoSinReservar && input.fecha < today ? input.fecha : today
      });
      memberPackageId = sale.id;
    }

    const usable = await findUsablePackages(tx, {
      clientId: input.clientId,
      memberId: member.id,
      disciplineId,
      fecha: input.fecha
    });
    const chosen = memberPackageId ? usable.find((item) => item.id === memberPackageId) : usable[0];
    if (!chosen) {
      throw new ApiError(
        422,
        memberPackageId
          ? "Ese paquete no sirve para esta clase (otra disciplina, vencido o sin clases)"
          : "No tiene un paquete vigente para esta disciplina"
      );
    }

    await consumeClass(tx, chosen.id);

    const data = {
      memberPackageId: chosen.id,
      estado: input.llegoSinReservar ? ("ASISTIO" as const) : ("RESERVADA" as const),
      asistenciaAt: input.llegoSinReservar ? new Date() : null,
      sinReserva: Boolean(input.llegoSinReservar),
      origen: input.origen ?? "PANEL",
      canceladaAt: null,
      claseDevuelta: false,
      ...(input.accessToken ? { accessToken: input.accessToken } : {})
    };

    // Quien cancelo y vuelve a reservar reutiliza su fila (indice unico).
    const booking = existing
      ? await tx.booking.update({ where: { id: existing.id }, data })
      : await tx.booking.create({ data: { ...data, clientId: input.clientId, sessionId: current.id, memberId: member.id } });

    if (input.venta?.receipt) {
      await tx.paymentReceipt.create({
        data: {
          clientId: input.clientId,
          memberPackageId: chosen.id,
          bookingId: booking.id,
          url: input.venta.receipt.media.url,
          publicId: input.venta.receipt.media.publicId,
          metodoPago: input.venta.receipt.metodo
        }
      });
    }

    // Spec 015: si estaba en la lista de espera de esta clase, ya tiene cupo.
    await tx.waitlistEntry.updateMany({
      where: { sessionId: current.id, memberId: member.id, estado: "EN_ESPERA" },
      data: { estado: "ASIGNADA", bookingId: booking.id }
    });
    return booking;
  });
}

export async function cancelBooking(params: { clientId: string; bookingId: string; devolverClase?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: { id: params.bookingId, clientId: params.clientId },
      include: { session: true, client: { select: { horasCancelacion: true } } }
    });
    if (!booking) throw new ApiError(404, "Reserva no encontrada");
    if (booking.estado === "CANCELADA") throw new ApiError(409, "La reserva ya está cancelada");

    const onTime = isBeforeCancellationDeadline(
      dateToDateKey(booking.session.fecha),
      booking.session.horaInicio,
      booking.client.horasCancelacion
    );
    const refund = onTime || Boolean(params.devolverClase);

    // updateMany condicionado: si llegan dos cancelaciones a la vez, solo una devuelve.
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, estado: { not: "CANCELADA" } },
      data: { estado: "CANCELADA", canceladaAt: new Date(), claseDevuelta: refund }
    });
    if (count === 0) throw new ApiError(409, "La reserva ya está cancelada");
    if (refund) await refundClass(tx, booking.memberPackageId);

    return { claseDevuelta: refund };
  });
}

/** Spec 007 R4: al cancelar una clase, sus reservas se cancelan y todas recuperan la clase. */
export async function cancelSessionBookings(tx: ExtendedTransactionClient, sessionId: string) {
  const active = await tx.booking.findMany({
    where: { sessionId, estado: { in: [...ACTIVE_STATES] } },
    select: { id: true, memberPackageId: true }
  });

  for (const booking of active) {
    await tx.booking.update({
      where: { id: booking.id },
      data: { estado: "CANCELADA", canceladaAt: new Date(), claseDevuelta: true }
    });
    await refundClass(tx, booking.memberPackageId);
  }

  return active.length;
}

/** Reservas activas desde hoy: impiden borrar un horario o anular una venta. */
export async function countFutureActiveBookings(where: Prisma.BookingWhereInput) {
  return prisma.booking.count({
    where: {
      ...where,
      estado: "RESERVADA",
      session: { fecha: { gte: dateKeyToDate(studioNow().dateKey) } }
    }
  });
}

export const bookingInclude = {
  member: { select: { id: true, nombre: true, apellido: true, celular: true } },
  memberPackage: {
    select: { id: true, nombre: true, clases: true, clasesUsadas: true, discipline: { select: { nombre: true, color: true } } }
  },
  session: {
    select: {
      id: true,
      scheduleId: true,
      fecha: true,
      horaInicio: true,
      duracionMin: true,
      cancelada: true,
      schedule: { select: { discipline: { select: { id: true, nombre: true, color: true } } } }
    }
  }
} satisfies Prisma.BookingInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export function serializeBooking(row: BookingRow) {
  return {
    id: row.id,
    estado: row.estado,
    origen: row.origen,
    claseDevuelta: row.claseDevuelta,
    canceladaAt: row.canceladaAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    member: row.member,
    memberPackage: {
      id: row.memberPackage.id,
      nombre: row.memberPackage.nombre,
      discipline: row.memberPackage.discipline,
      clasesRestantes: Math.max(row.memberPackage.clases - row.memberPackage.clasesUsadas, 0)
    },
    session: {
      id: row.session.id,
      scheduleId: row.session.scheduleId,
      fecha: dateToDateKey(row.session.fecha),
      horaInicio: row.session.horaInicio,
      duracionMin: row.session.duracionMin,
      cancelada: row.session.cancelada,
      discipline: row.session.schedule.discipline
    }
  };
}

export type BookingView = ReturnType<typeof serializeBooking>;
