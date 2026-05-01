import { Prisma } from "@prisma/client";
import { startOfLocalDay, startOfNextLocalDay } from "./dates";
import { ensureCurrentMonthlyPayments } from "./monthly-payments";
import { prisma } from "./prisma";
import { hasPushFailures, sendExpoPushNotifications } from "./push";

const MAX_ATTEMPTS = 3;

type QueueResult = {
  created: number;
  processed: number;
  sent: number;
  failed: number;
  skippedNoTokens: number;
};

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysOverdue(date: Date) {
  const today = startOfLocalDay();
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

function money(value: Prisma.Decimal | number | string) {
  return Number(value).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

async function createNotificationOnce(params: {
  clientId: string;
  type: string;
  dedupKey: string;
  title: string;
  body: string;
  data: Prisma.InputJsonObject;
}) {
  try {
    await prisma.notification.create({
      data: {
        clientId: params.clientId,
        type: params.type,
        dedupKey: params.dedupKey,
        title: params.title,
        body: params.body,
        data: params.data,
        status: "PENDIENTE"
      }
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

export async function queueAndSendAdminPaymentReminders(): Promise<QueueResult> {
  const result: QueueResult = { created: 0, processed: 0, sent: 0, failed: 0, skippedNoTokens: 0 };
  const clients = await prisma.client.findMany({ where: { deletedAt: null }, select: { id: true } });
  const today = dateKey();
  const todayStart = startOfLocalDay();
  const tomorrowStart = startOfNextLocalDay();

  for (const client of clients) {
    await ensureCurrentMonthlyPayments(client.id);

    const [monthlyDueToday, monthlyOverdue, enrollmentDueToday, enrollmentOverdue] = await Promise.all([
      prisma.monthlyPayment.findMany({
        where: { clientId: client.id, deletedAt: null, estado: "PENDIENTE", fechaVencimiento: { gte: todayStart, lt: tomorrowStart }, student: { estado: "ACTIVO", deletedAt: null } },
        include: { student: true, group: true }
      }),
      prisma.monthlyPayment.findMany({
        where: { clientId: client.id, deletedAt: null, student: { estado: "ACTIVO", deletedAt: null }, OR: [{ estado: "VENCIDO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } }] },
        include: { student: true, group: true }
      }),
      prisma.enrollmentPayment.findMany({
        where: { clientId: client.id, deletedAt: null, estado: "PENDIENTE", fechaVencimiento: { gte: todayStart, lt: tomorrowStart }, student: { estado: "ACTIVO", deletedAt: null } },
        include: { student: { include: { group: true } } }
      }),
      prisma.enrollmentPayment.findMany({
        where: { clientId: client.id, deletedAt: null, student: { estado: "ACTIVO", deletedAt: null }, OR: [{ estado: "VENCIDO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } }] },
        include: { student: { include: { group: true } } }
      })
    ]);

    for (const payment of monthlyDueToday) {
      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const created = await createNotificationOnce({
        clientId: client.id,
        type: "MONTHLY_DUE_TODAY",
        dedupKey: `${client.id}:monthly-due:${payment.id}:${today}`,
        title: "Cobro de mensualidad hoy",
        body: `Hoy es dia de cobro para ${name}. Valor: ${money(payment.monto)}.`,
        data: { type: "MONTHLY_DUE_TODAY", monthlyPaymentId: payment.id, studentId: payment.estudianteId }
      });
      if (created) result.created += 1;
    }

    for (const payment of monthlyOverdue) {
      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const days = daysOverdue(payment.fechaVencimiento);
      const created = await createNotificationOnce({
        clientId: client.id,
        type: "MONTHLY_OVERDUE",
        dedupKey: `${client.id}:monthly-overdue:${payment.id}:${today}`,
        title: "Mensualidad vencida",
        body: `${name} aun no paga. Lleva ${days} dia${days === 1 ? "" : "s"} vencido. Valor: ${money(payment.monto)}.`,
        data: { type: "MONTHLY_OVERDUE", monthlyPaymentId: payment.id, studentId: payment.estudianteId, daysOverdue: days }
      });
      if (created) result.created += 1;
    }

    for (const payment of enrollmentDueToday) {
      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const created = await createNotificationOnce({
        clientId: client.id,
        type: "ENROLLMENT_DUE_TODAY",
        dedupKey: `${client.id}:enrollment-due:${payment.id}:${today}`,
        title: "Inscripcion pendiente",
        body: `Hoy debes cobrar la inscripcion de ${name}. Valor: ${money(payment.monto)}.`,
        data: { type: "ENROLLMENT_DUE_TODAY", enrollmentPaymentId: payment.id, studentId: payment.estudianteId }
      });
      if (created) result.created += 1;
    }

    for (const payment of enrollmentOverdue) {
      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const days = daysOverdue(payment.fechaVencimiento);
      const created = await createNotificationOnce({
        clientId: client.id,
        type: "ENROLLMENT_OVERDUE",
        dedupKey: `${client.id}:enrollment-overdue:${payment.id}:${today}`,
        title: "Inscripcion vencida",
        body: `${name} aun no paga la inscripcion. Lleva ${days} dia${days === 1 ? "" : "s"} vencida. Valor: ${money(payment.monto)}.`,
        data: { type: "ENROLLMENT_OVERDUE", enrollmentPaymentId: payment.id, studentId: payment.estudianteId, daysOverdue: days }
      });
      if (created) result.created += 1;
    }
  }

  const dueNotifications = await prisma.notification.findMany({
    where: {
      status: "PENDIENTE",
      attempts: { lt: MAX_ATTEMPTS },
      nextAttemptAt: { lte: new Date() }
    },
    orderBy: { createdAt: "asc" },
    take: 50
  });

  for (const notification of dueNotifications) {
    result.processed += 1;
    const tokens = await prisma.pushToken.findMany({ where: { clientId: notification.clientId, isActive: true } });
    if (tokens.length === 0) {
      result.skippedNoTokens += 1;
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + 10 * 60 * 1000),
          error: "No hay dispositivos registrados para push"
        }
      });
      continue;
    }

    try {
      const tickets = await sendExpoPushNotifications(
        tokens.map((token) => token.token),
        notification.title,
        notification.body,
        (notification.data as Record<string, unknown> | null) ?? undefined
      );
      if (hasPushFailures(tickets)) throw new Error("Expo devolvio tickets con error");

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "ENVIADA", sentAt: new Date(), error: null }
      });
      result.sent += 1;
    } catch (error) {
      const attempts = notification.attempts + 1;
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? "FALLIDA" : "PENDIENTE",
          attempts,
          nextAttemptAt: new Date(Date.now() + Math.pow(2, attempts) * 60 * 1000),
          error: error instanceof Error ? error.message : "Error desconocido"
        }
      });
      result.failed += 1;
    }
  }

  return result;
}
