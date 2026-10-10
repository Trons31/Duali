import type { PaymentReceiptStatus } from "@prisma/client";
import { assertOwnedMedia, deleteFromCloudinary, signUpload } from "@/lib/cloudinary";
import { ApiError } from "@/lib/http";
import { mediaFolder } from "@/lib/media-folders";
import { addPackagePayment } from "@/lib/member-packages";
import { queueNotification } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/studio-messages";

// Comprobantes de pago enviados desde la reserva web (spec 014).

export const MAX_PENDING_RECEIPTS = 3;

/** La reserva web detras de un token, con su venta; exige saldo pendiente. */
async function bookingWithBalance(token: string) {
  const booking = await prisma.booking.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      clientId: true,
      member: { select: { id: true, nombre: true } },
      memberPackage: { select: { id: true, precio: true, pagado: true, anuladoAt: true } }
    }
  });
  if (!booking) throw new ApiError(404, "Reserva no encontrada");
  const saldo = Number(booking.memberPackage.precio) - Number(booking.memberPackage.pagado);
  if (booking.memberPackage.anuladoAt || saldo <= 0) throw new ApiError(409, "Esta reserva no tiene saldo por pagar");
  return { ...booking, saldo };
}

async function pendingCount(memberPackageId: string) {
  return prisma.paymentReceipt.count({ where: { memberPackageId, estado: "POR_REVISAR" } });
}

/** Spec 014 R1: solo con el enlace privado de una reserva con saldo. */
export async function signReceiptUpload(token: string) {
  const booking = await bookingWithBalance(token);
  if ((await pendingCount(booking.memberPackage.id)) >= MAX_PENDING_RECEIPTS) {
    throw new ApiError(429, "Ya enviaste varios comprobantes; el estudio los está revisando");
  }
  return signUpload(booking.clientId, "IMAGEN", "comprobantes");
}

/** Spec 014 R2. */
export async function attachReceipt(token: string, media: { url: string; publicId: string }) {
  const booking = await prisma.booking.findUnique({ where: { accessToken: token }, select: { clientId: true } });
  if (!booking) throw new ApiError(404, "Reserva no encontrada");
  assertOwnedMedia(media, booking.clientId, "IMAGEN");
  if (!media.publicId.startsWith(`${mediaFolder(booking.clientId, "IMAGEN", "comprobantes")}/`)) {
    throw new ApiError(422, "Ese archivo no es un comprobante de este estudio");
  }

  try {
    return await saveReceipt(token, media);
  } catch (error) {
    // Ya se subio (la firma paso las mismas reglas): si algo cambio en el medio
    // (otro comprobante llego al tope, se pago el saldo), no se deja huerfano.
    await deleteFromCloudinary(media.publicId, "IMAGEN");
    throw error;
  }
}

async function saveReceipt(token: string, media: { url: string; publicId: string }) {
  const booking = await bookingWithBalance(token);
  if ((await pendingCount(booking.memberPackage.id)) >= MAX_PENDING_RECEIPTS) {
    throw new ApiError(429, "Ya enviaste varios comprobantes; el estudio los está revisando");
  }

  const receipt = await prisma.paymentReceipt.create({
    data: {
      clientId: booking.clientId,
      memberPackageId: booking.memberPackage.id,
      bookingId: booking.id,
      url: media.url,
      publicId: media.publicId
    },
    select: { id: true, estado: true, createdAt: true }
  });

  try {
    await queueNotification({
      clientId: booking.clientId,
      type: "STUDIO_RECEIPT",
      dedupKey: `studio-receipt:${receipt.id}`,
      title: `${booking.member.nombre} envió un comprobante`,
      body: `Saldo por revisar: ${money(booking.saldo)}`,
      data: { type: "STUDIO_RECEIPT", href: `/dashboard/clientes/${booking.member.id}`, receiptId: receipt.id }
    });
  } catch (error) {
    console.error("No se pudo avisar el comprobante", error);
  }

  return receipt;
}

export async function listReceipts(clientId: string, estado?: PaymentReceiptStatus, memberId?: string) {
  const rows = await prisma.paymentReceipt.findMany({
    where: { clientId, ...(estado ? { estado } : {}), ...(memberId ? { memberPackage: { memberId } } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      estado: true,
      motivoRechazo: true,
      createdAt: true,
      memberPackage: {
        select: {
          id: true,
          nombre: true,
          precio: true,
          pagado: true,
          discipline: { select: { nombre: true, color: true } },
          member: { select: { id: true, nombre: true, apellido: true } }
        }
      }
    }
  });
  return rows.map(({ memberPackage, ...receipt }) => ({
    ...receipt,
    createdAt: receipt.createdAt.toISOString(),
    member: memberPackage.member,
    sale: {
      id: memberPackage.id,
      nombre: memberPackage.nombre,
      discipline: memberPackage.discipline,
      saldo: Math.max(Number(memberPackage.precio) - Number(memberPackage.pagado), 0)
    }
  }));
}

export type ReceiptView = Awaited<ReturnType<typeof listReceipts>>[number];

async function findPending(clientId: string, id: string) {
  const receipt = await prisma.paymentReceipt.findFirst({ where: { id, clientId } });
  if (!receipt) throw new ApiError(404, "Comprobante no encontrado");
  if (receipt.estado !== "POR_REVISAR") throw new ApiError(409, "Este comprobante ya fue revisado");
  return receipt;
}

/** Spec 014 R3: aprobar = registrar el pago (misma regla de la 006) y enlazarlo. */
export async function approveReceipt(clientId: string, id: string, input: { monto: number; metodoPago: string }) {
  const receipt = await findPending(clientId, id);
  return prisma.$transaction(async (tx) => {
    // updateMany condicionado: si se aprueba dos veces a la vez, solo una registra el pago.
    const { count } = await tx.paymentReceipt.updateMany({
      where: { id, estado: "POR_REVISAR" },
      data: { estado: "APROBADO", reviewedAt: new Date() }
    });
    if (count === 0) throw new ApiError(409, "Este comprobante ya fue revisado");
    const payment = await addPackagePayment(tx, {
      clientId,
      saleId: receipt.memberPackageId,
      monto: input.monto,
      metodoPago: input.metodoPago,
      notas: "Comprobante enviado desde la página"
    });
    return tx.paymentReceipt.update({ where: { id }, data: { paymentId: payment.id }, select: { id: true, estado: true, paymentId: true } });
  });
}

export async function rejectReceipt(clientId: string, id: string, motivo?: string | null) {
  const receipt = await findPending(clientId, id);
  const { count } = await prisma.paymentReceipt.updateMany({
    where: { id, estado: "POR_REVISAR" },
    data: { estado: "RECHAZADO", motivoRechazo: motivo ?? null, reviewedAt: new Date() }
  });
  if (count === 0) throw new ApiError(409, "Este comprobante ya fue revisado");
  await deleteFromCloudinary(receipt.publicId, "IMAGEN");
  return { id, estado: "RECHAZADO" as const };
}
