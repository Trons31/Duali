import type { Prisma } from "@prisma/client";
import { startOfLocalDay, startOfNextLocalDay } from "./dates";
import { ensureCurrentMonthlyPayments } from "./monthly-payments";
import { newDeadline, processNotificationQueue, queueNotification } from "./notification-queue";
import { prisma } from "./prisma";

type QueueResult = {
  queued: number;
  deduped: number;
  timedOut: boolean;
  queue: Awaited<ReturnType<typeof processNotificationQueue>> | null;
};

// Ventana de antiguedad para los cobros vencidos. Sin esto las consultas traian
// TODO el historico y el cron tardaba mas cada mes que pasaba.
const OVERDUE_WINDOW_DAYS = Number(process.env.REMINDER_OVERDUE_WINDOW_DAYS ?? "45");

function overdueWindowStart(todayStart: Date) {
  const start = new Date(todayStart);
  start.setDate(start.getDate() - OVERDUE_WINDOW_DAYS);
  return start;
}

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

export async function queueAdminPaymentReminders(options?: { deadline?: number }) {
  const deadline = options?.deadline ?? newDeadline(20_000);
  const result = { queued: 0, deduped: 0, timedOut: false };
  const clients = await prisma.client.findMany({ where: { deletedAt: null }, select: { id: true } });
  const today = dateKey();
  const todayStart = startOfLocalDay();
  const tomorrowStart = startOfNextLocalDay();
  const overdueSince = overdueWindowStart(todayStart);

  for (const client of clients) {
    if (Date.now() >= deadline) {
      result.timedOut = true;
      break;
    }

    await ensureCurrentMonthlyPayments(client.id);

    // Los dedupKey ya llevan la fecha de hoy, asi que a partir de la segunda
    // corrida del dia TODO se deduplica. Antes eso costaba una transaccion por
    // cada pago; ahora se resuelve con una sola consulta y el resto se salta.
    const existingKeys = new Set(
      (
        await prisma.notification.findMany({
          where: {
            clientId: client.id,
            dedupKey: { startsWith: `${client.id}:`, endsWith: `:${today}` }
          },
          select: { dedupKey: true }
        })
      )
        .map((notification) => notification.dedupKey)
        .filter((key): key is string => Boolean(key))
    );

    const alreadyQueued = (dedupKey: string) => {
      if (!existingKeys.has(dedupKey)) return false;
      result.deduped += 1;
      return true;
    };

    const monthlyDueToday = await prisma.monthlyPayment.findMany({
      where: { clientId: client.id, deletedAt: null, estado: "PENDIENTE", fechaVencimiento: { gte: todayStart, lt: tomorrowStart }, student: { estado: "ACTIVO", deletedAt: null } },
      include: { student: true, group: true }
    });
    const monthlyOverdue = await prisma.monthlyPayment.findMany({
      where: { clientId: client.id, deletedAt: null, student: { estado: "ACTIVO", deletedAt: null }, fechaVencimiento: { gte: overdueSince }, OR: [{ estado: "VENCIDO" }, { estado: "ABONADO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } }] },
      include: { student: true, group: true }
    });
    const enrollmentDueToday = await prisma.enrollmentPayment.findMany({
      where: { clientId: client.id, deletedAt: null, estado: "PENDIENTE", fechaVencimiento: { gte: todayStart, lt: tomorrowStart }, student: { estado: "ACTIVO", deletedAt: null } },
      include: { student: { include: { group: true } } }
    });
    const enrollmentOverdue = await prisma.enrollmentPayment.findMany({
      where: { clientId: client.id, deletedAt: null, student: { estado: "ACTIVO", deletedAt: null }, fechaVencimiento: { gte: overdueSince }, OR: [{ estado: "VENCIDO" }, { estado: "ABONADO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } }] },
      include: { student: { include: { group: true } } }
    });

    for (const payment of monthlyDueToday) {
      const dedupKey = `${client.id}:monthly-due:${payment.id}:${today}`;
      if (alreadyQueued(dedupKey)) continue;

      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const queued = await queueNotification({
        clientId: client.id,
        type: "MONTHLY_DUE_TODAY",
        dedupKey,
        title: "Cobro de mensualidad hoy",
        body: `Hoy es dia de cobro para ${name}. Valor: ${money(payment.monto)}.`,
        data: { type: "MONTHLY_DUE_TODAY", monthlyPaymentId: payment.id, studentId: payment.estudianteId }
      });
      if (queued.deduped) result.deduped += 1;
      else result.queued += 1;
    }

    for (const payment of monthlyOverdue) {
      const dedupKey = `${client.id}:monthly-overdue:${payment.id}:${today}`;
      if (alreadyQueued(dedupKey)) continue;

      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const days = daysOverdue(payment.fechaVencimiento);
      const queued = await queueNotification({
        clientId: client.id,
        type: "MONTHLY_OVERDUE",
        dedupKey,
        title: "Mensualidad vencida",
        body: `${name} aun tiene saldo pendiente. Lleva ${days} dia${days === 1 ? "" : "s"} vencido. Saldo: ${money(payment.saldoPendiente || payment.monto)}.`,
        data: { type: "MONTHLY_OVERDUE", monthlyPaymentId: payment.id, studentId: payment.estudianteId, daysOverdue: days }
      });
      if (queued.deduped) result.deduped += 1;
      else result.queued += 1;
    }

    for (const payment of enrollmentDueToday) {
      const dedupKey = `${client.id}:enrollment-due:${payment.id}:${today}`;
      if (alreadyQueued(dedupKey)) continue;

      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const queued = await queueNotification({
        clientId: client.id,
        type: "ENROLLMENT_DUE_TODAY",
        dedupKey,
        title: "Inscripcion pendiente",
        body: `Hoy debes cobrar la inscripcion de ${name}. Valor: ${money(payment.monto)}.`,
        data: { type: "ENROLLMENT_DUE_TODAY", enrollmentPaymentId: payment.id, studentId: payment.estudianteId }
      });
      if (queued.deduped) result.deduped += 1;
      else result.queued += 1;
    }

    for (const payment of enrollmentOverdue) {
      const dedupKey = `${client.id}:enrollment-overdue:${payment.id}:${today}`;
      if (alreadyQueued(dedupKey)) continue;

      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const days = daysOverdue(payment.fechaVencimiento);
      const queued = await queueNotification({
        clientId: client.id,
        type: "ENROLLMENT_OVERDUE",
        dedupKey,
        title: "Inscripcion vencida",
        body: `${name} aun tiene saldo pendiente de inscripcion. Lleva ${days} dia${days === 1 ? "" : "s"} vencida. Saldo: ${money(payment.saldoPendiente || payment.monto)}.`,
        data: { type: "ENROLLMENT_OVERDUE", enrollmentPaymentId: payment.id, studentId: payment.estudianteId, daysOverdue: days }
      });
      if (queued.deduped) result.deduped += 1;
      else result.queued += 1;
    }
  }

  return result;
}

export async function queueAndSendAdminPaymentReminders(limit = 25): Promise<QueueResult> {
  const deadline = newDeadline();
  const reminders = await queueAdminPaymentReminders({ deadline });
  const queue = await processNotificationQueue(limit, { deadline });
  return { ...reminders, queue };
}
