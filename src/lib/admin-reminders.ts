import type { Prisma } from "@prisma/client";
import { startOfLocalDay, startOfNextLocalDay } from "./dates";
import { ensureCurrentMonthlyPayments } from "./monthly-payments";
import { processNotificationQueue, queueNotification } from "./notification-queue";
import { prisma } from "./prisma";

type QueueResult = {
  queued: number;
  deduped: number;
  queue: Awaited<ReturnType<typeof processNotificationQueue>> | null;
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

export async function queueAdminPaymentReminders() {
  const result = { queued: 0, deduped: 0 };
  const clients = await prisma.client.findMany({ where: { deletedAt: null }, select: { id: true } });
  const today = dateKey();
  const todayStart = startOfLocalDay();
  const tomorrowStart = startOfNextLocalDay();

  for (const client of clients) {
    await ensureCurrentMonthlyPayments(client.id);

    const monthlyDueToday = await prisma.monthlyPayment.findMany({
      where: { clientId: client.id, deletedAt: null, estado: "PENDIENTE", fechaVencimiento: { gte: todayStart, lt: tomorrowStart }, student: { estado: "ACTIVO", deletedAt: null } },
      include: { student: true, group: true }
    });
    const monthlyOverdue = await prisma.monthlyPayment.findMany({
      where: { clientId: client.id, deletedAt: null, student: { estado: "ACTIVO", deletedAt: null }, OR: [{ estado: "VENCIDO" }, { estado: "ABONADO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } }] },
      include: { student: true, group: true }
    });
    const enrollmentDueToday = await prisma.enrollmentPayment.findMany({
      where: { clientId: client.id, deletedAt: null, estado: "PENDIENTE", fechaVencimiento: { gte: todayStart, lt: tomorrowStart }, student: { estado: "ACTIVO", deletedAt: null } },
      include: { student: { include: { group: true } } }
    });
    const enrollmentOverdue = await prisma.enrollmentPayment.findMany({
      where: { clientId: client.id, deletedAt: null, student: { estado: "ACTIVO", deletedAt: null }, OR: [{ estado: "VENCIDO" }, { estado: "ABONADO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } }] },
      include: { student: { include: { group: true } } }
    });

    for (const payment of monthlyDueToday) {
      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const queued = await queueNotification({
        clientId: client.id,
        type: "MONTHLY_DUE_TODAY",
        dedupKey: `${client.id}:monthly-due:${payment.id}:${today}`,
        title: "Cobro de mensualidad hoy",
        body: `Hoy es dia de cobro para ${name}. Valor: ${money(payment.monto)}.`,
        data: { type: "MONTHLY_DUE_TODAY", monthlyPaymentId: payment.id, studentId: payment.estudianteId }
      });
      if (queued.deduped) result.deduped += 1;
      else result.queued += 1;
    }

    for (const payment of monthlyOverdue) {
      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const days = daysOverdue(payment.fechaVencimiento);
      const queued = await queueNotification({
        clientId: client.id,
        type: "MONTHLY_OVERDUE",
        dedupKey: `${client.id}:monthly-overdue:${payment.id}:${today}`,
        title: "Mensualidad vencida",
        body: `${name} aun tiene saldo pendiente. Lleva ${days} dia${days === 1 ? "" : "s"} vencido. Saldo: ${money(payment.saldoPendiente || payment.monto)}.`,
        data: { type: "MONTHLY_OVERDUE", monthlyPaymentId: payment.id, studentId: payment.estudianteId, daysOverdue: days }
      });
      if (queued.deduped) result.deduped += 1;
      else result.queued += 1;
    }

    for (const payment of enrollmentDueToday) {
      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const queued = await queueNotification({
        clientId: client.id,
        type: "ENROLLMENT_DUE_TODAY",
        dedupKey: `${client.id}:enrollment-due:${payment.id}:${today}`,
        title: "Inscripcion pendiente",
        body: `Hoy debes cobrar la inscripcion de ${name}. Valor: ${money(payment.monto)}.`,
        data: { type: "ENROLLMENT_DUE_TODAY", enrollmentPaymentId: payment.id, studentId: payment.estudianteId }
      });
      if (queued.deduped) result.deduped += 1;
      else result.queued += 1;
    }

    for (const payment of enrollmentOverdue) {
      const name = `${payment.student.nombre} ${payment.student.apellido}`;
      const days = daysOverdue(payment.fechaVencimiento);
      const queued = await queueNotification({
        clientId: client.id,
        type: "ENROLLMENT_OVERDUE",
        dedupKey: `${client.id}:enrollment-overdue:${payment.id}:${today}`,
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

export async function queueAndSendAdminPaymentReminders(limit = 100): Promise<QueueResult> {
  const reminders = await queueAdminPaymentReminders();
  const queue = await processNotificationQueue(limit);
  return { ...reminders, queue };
}
