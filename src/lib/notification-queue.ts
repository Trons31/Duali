import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hasPushFailures, sendExpoPushNotifications } from "./push";

const MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_LIMIT = 100;

export type QueueNotificationInput = {
  clientId: string;
  type: string;
  dedupKey?: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonObject;
};

export type QueueNotificationResult = {
  notificationId: string;
  sequence: number;
  deduped: boolean;
};

export type NotificationQueueSummary = {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  skippedNoTokens: number;
};

function retryDate(attempt: number) {
  const minutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attempt - 1)));
  const jitterSeconds = Math.floor(Math.random() * 30);
  return new Date(Date.now() + minutes * 60_000 + jitterSeconds * 1000);
}

function lockUntil() {
  return new Date(Date.now() + 5 * 60_000);
}

function parseLimit(value: string | null, fallback = DEFAULT_BATCH_LIMIT) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 300) : fallback;
}

export function getNotificationBatchLimit(request: Request) {
  const { searchParams } = new URL(request.url);
  return parseLimit(searchParams.get("limit"));
}

export async function queueNotification(input: QueueNotificationInput): Promise<QueueNotificationResult> {
  try {
    const notification = await prisma.notification.create({
      data: {
        clientId: input.clientId,
        type: input.type,
        dedupKey: input.dedupKey,
        title: input.title,
        body: input.body,
        data: input.data ?? {},
        status: "PENDIENTE",
        nextAttemptAt: new Date()
      },
      select: { id: true, sequence: true }
    });

    return { notificationId: notification.id, sequence: notification.sequence, deduped: false };
  } catch (error) {
    if (input.dedupKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.notification.findUnique({
        where: { dedupKey: input.dedupKey },
        select: { id: true, sequence: true }
      });

      if (existing) return { notificationId: existing.id, sequence: existing.sequence, deduped: true };
    }

    throw error;
  }
}

async function processNotification(notificationId: string) {
  const now = new Date();
  const claimed = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      status: "PENDIENTE",
      attempts: { lt: MAX_ATTEMPTS },
      nextAttemptAt: { lte: now }
    },
    data: {
      attempts: { increment: 1 },
      nextAttemptAt: lockUntil(),
      error: null
    }
  });

  if (!claimed.count) return { processed: false, sent: false, retried: false, failed: false, skippedNoTokens: false };

  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) return { processed: false, sent: false, retried: false, failed: false, skippedNoTokens: false };

  const tokens = await prisma.pushToken.findMany({
    where: { clientId: notification.clientId, isActive: true },
    select: { token: true }
  });

  if (!tokens.length) {
    const exhausted = notification.attempts >= MAX_ATTEMPTS;
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: exhausted ? "FALLIDA" : "PENDIENTE",
        nextAttemptAt: retryDate(notification.attempts),
        error: "No hay dispositivos registrados para push"
      }
    });

    return { processed: true, sent: false, retried: !exhausted, failed: exhausted, skippedNoTokens: true };
  }

  try {
    const tickets = await sendExpoPushNotifications(
      tokens.map((token) => token.token),
      notification.title,
      notification.body,
      {
        ...((notification.data as Record<string, unknown> | null) ?? {}),
        notificationId: notification.id,
        sequence: notification.sequence
      }
    );

    if (hasPushFailures(tickets)) throw new Error("Expo devolvio tickets con error");

    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: "ENVIADA", sentAt: new Date(), error: null }
    });

    return { processed: true, sent: true, retried: false, failed: false, skippedNoTokens: false };
  } catch (error) {
    const exhausted = notification.attempts >= MAX_ATTEMPTS;
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: exhausted ? "FALLIDA" : "PENDIENTE",
        nextAttemptAt: exhausted ? notification.nextAttemptAt : retryDate(notification.attempts),
        error: error instanceof Error ? error.message : "Error desconocido"
      }
    });

    return { processed: true, sent: false, retried: !exhausted, failed: exhausted, skippedNoTokens: false };
  }
}

export async function processNotificationQueue(limit = DEFAULT_BATCH_LIMIT): Promise<NotificationQueueSummary> {
  const dueNotifications = await prisma.notification.findMany({
    where: {
      status: "PENDIENTE",
      attempts: { lt: MAX_ATTEMPTS },
      nextAttemptAt: { lte: new Date() }
    },
    orderBy: [{ sequence: "asc" }],
    select: { id: true },
    take: limit
  });

  const summary: NotificationQueueSummary = {
    processed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skippedNoTokens: 0
  };

  for (const candidate of dueNotifications) {
    const result = await processNotification(candidate.id);
    if (!result.processed) continue;

    summary.processed += 1;
    if (result.sent) summary.sent += 1;
    if (result.retried) summary.retried += 1;
    if (result.failed) summary.failed += 1;
    if (result.skippedNoTokens) summary.skippedNoTokens += 1;
  }

  return summary;
}

export async function getNotificationsForClient(clientId: string, afterSequence = 0, limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return prisma.notification.findMany({
    where: { clientId, sequence: { gt: Math.max(afterSequence, 0) }, status: { in: ["ENVIADA", "LEIDA"] } },
    orderBy: { sequence: "asc" },
    take: safeLimit
  });
}

export async function acknowledgeDeliveredNotifications(
  clientId: string,
  input: { notificationIds?: string[]; uptoSequence?: number }
) {
  const ids = input.notificationIds?.filter(Boolean) ?? [];
  const sequenceCap = input.uptoSequence ?? 0;
  if (!ids.length && sequenceCap <= 0) return { updated: 0, lastDeliveredSequence: 0 };

  const conditions: Prisma.NotificationWhereInput[] = [];
  if (ids.length) conditions.push({ id: { in: ids } });
  if (sequenceCap > 0) conditions.push({ sequence: { lte: sequenceCap } });

  const targets = await prisma.notification.findMany({
    where: { clientId, OR: conditions },
    select: { id: true, sequence: true }
  });

  if (!targets.length) return { updated: 0, lastDeliveredSequence: sequenceCap };

  const targetIds = targets.map((notification) => notification.id);
  const maxSequence = Math.max(sequenceCap, ...targets.map((notification) => notification.sequence));
  await prisma.notification.updateMany({
    where: { id: { in: targetIds }, clientId, deliveredAt: null },
    data: { deliveredAt: new Date() }
  });

  return { updated: targetIds.length, lastDeliveredSequence: maxSequence };
}

export async function markNotificationsRead(
  clientId: string,
  input: { notificationIds?: string[]; uptoSequence?: number }
) {
  const ids = input.notificationIds?.filter(Boolean) ?? [];
  const sequenceCap = input.uptoSequence ?? 0;
  if (!ids.length && sequenceCap <= 0) return { updated: 0, lastReadSequence: 0 };

  const conditions: Prisma.NotificationWhereInput[] = [];
  if (ids.length) conditions.push({ id: { in: ids } });
  if (sequenceCap > 0) conditions.push({ sequence: { lte: sequenceCap } });

  const targets = await prisma.notification.findMany({
    where: { clientId, OR: conditions },
    select: { id: true, sequence: true }
  });

  if (!targets.length) return { updated: 0, lastReadSequence: sequenceCap };

  const now = new Date();
  const targetIds = targets.map((notification) => notification.id);
  const maxSequence = Math.max(sequenceCap, ...targets.map((notification) => notification.sequence));
  await prisma.notification.updateMany({
    where: { id: { in: targetIds }, clientId },
    data: { status: "LEIDA", deliveredAt: now, readAt: now }
  });

  return { updated: targetIds.length, lastReadSequence: maxSequence };
}
