import { Prisma, type NotificationChannel, type NotificationDeliveryStatus, type NotificationQueueStatus } from "@prisma/client";
import { getPushFailureDetails, sendExpoPushNotifications } from "./push";
import { prisma } from "./prisma";
import { sendWebPushNotifications } from "./web-push";

const MAX_PROCESSING_ATTEMPTS = 5;
// Debe ser MAYOR que el maxDuration del cron, si no una funcion que expira
// deja sus filas "obsoletas" justo al morir y la reparacion las resucita al instante.
const STALE_PROCESSING_MINUTES = 15;
const DEFAULT_BATCH_LIMIT = 25;
// Presupuesto de tiempo por invocacion. La funcion devuelve resultados parciales
// antes de agotarlo en vez de morir con 504 a los 300s (y facturar esos 300s).
// Lo que quede pendiente lo toma la siguiente corrida del cron.
const DEFAULT_TIME_BUDGET_MS = Number(process.env.CRON_TIME_BUDGET_MS ?? "40000");

export function newDeadline(budgetMs = DEFAULT_TIME_BUDGET_MS) {
  return Date.now() + Math.max(1_000, budgetMs);
}

function outOfTime(deadline: number) {
  return Date.now() >= deadline;
}

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
  repaired: number;
  repairedSentWithoutDelivery: number;
  clientsLocked: number;
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  skippedNoTokens: number;
  timedOut: boolean;
};

type DispatchSummary = {
  attempted: boolean;
  success: boolean;
  shouldRetry: boolean;
  providerMessageId?: string;
  error?: string;
  invalidTokens: string[];
  invalidSubscriptions: string[];
};

function isPermanentExpoFailure(message: string) {
  return /InvalidCredentials|MismatchSenderId|Unable to retrieve the FCM server key|InvalidProviderToken|SenderId/i.test(
    message
  );
}

function retryDate(attemptCount: number) {
  const minutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
  const jitterSeconds = Math.floor(Math.random() * 30);
  return new Date(Date.now() + minutes * 60_000 + jitterSeconds * 1000);
}

function parseLimit(value: string | null, fallback = DEFAULT_BATCH_LIMIT) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : fallback;
}

function staleProcessingDate() {
  return new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000);
}

export function getNotificationBatchLimit(request: Request) {
  const { searchParams } = new URL(request.url);
  return parseLimit(searchParams.get("limit"));
}

// pg_try_advisory_lock es un lock de SESION. Con pgBouncer en modo transaccion
// (pgbouncer=true en DATABASE_URL) cada consulta puede ir a un backend distinto:
// el lock se toma en una conexion y el unlock puede ejecutarse en otra, dejando
// locks huerfanos que bloquean la cola de ese cliente para siempre.
// La exclusion real ya la garantiza el claim atomico de processSingleOutboxEntry
// (updateMany con guarda de status), asi que aqui el lock es solo best-effort.
const USE_ADVISORY_LOCK = process.env.NOTIFICATION_ADVISORY_LOCK === "true";

async function tryAcquireClientLock(clientId: string) {
  if (!USE_ADVISORY_LOCK) return true;

  try {
    const result = await prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext(${clientId})) AS locked
    `;
    return Boolean(result[0]?.locked);
  } catch {
    return true;
  }
}

async function releaseClientLock(clientId: string) {
  if (!USE_ADVISORY_LOCK) return;

  try {
    await prisma.$executeRaw`
      SELECT pg_advisory_unlock(hashtext(${clientId}))
    `;
  } catch {
    // no-op
  }
}

async function upsertDeliveryResult(input: {
  clientId: string;
  notificationId: string;
  channel: NotificationChannel;
  attempt: number;
  status: NotificationDeliveryStatus;
  providerMessageId?: string;
  error?: string | null;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  failedAt?: Date | null;
}) {
  await prisma.notificationDelivery.upsert({
    where: {
      notificationId_channel: {
        notificationId: input.notificationId,
        channel: input.channel
      }
    },
    create: {
      clientId: input.clientId,
      notificationId: input.notificationId,
      channel: input.channel,
      attempt: input.attempt,
      status: input.status,
      providerMessageId: input.providerMessageId ?? null,
      lastError: input.error ?? null,
      sentAt: input.sentAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
      failedAt: input.failedAt ?? null
    },
    update: {
      attempt: input.attempt,
      status: input.status,
      providerMessageId: input.providerMessageId ?? undefined,
      lastError: input.error ?? null,
      sentAt: input.sentAt ?? undefined,
      deliveredAt: input.deliveredAt ?? undefined,
      failedAt: input.failedAt ?? undefined
    }
  });
}

async function reviveNotificationTx(
  tx: Prisma.TransactionClient,
  notificationId: string,
  clientId: string
) {
  const now = new Date();

  await tx.notification.update({
    where: { id: notificationId },
    data: {
      status: "PENDIENTE",
      attempts: 0,
      nextAttemptAt: now,
      error: null,
      sentAt: null,
      deliveredAt: null,
      readAt: null
    }
  });

  await tx.notificationOutbox.upsert({
    where: { notificationId },
    create: {
      notificationId,
      clientId,
      status: "ENCOLADA",
      attemptCount: 0,
      nextAttemptAt: now,
      sentAt: null,
      lastError: null
    },
    update: {
      status: "ENCOLADA",
      attemptCount: 0,
      nextAttemptAt: now,
      processingStartedAt: null,
      lastAttemptAt: null,
      sentAt: null,
      lastError: null
    }
  });
}

function summarizeExpoDispatch(
  tickets: Awaited<ReturnType<typeof sendExpoPushNotifications>>
): DispatchSummary {
  if (!tickets.length) {
    return {
      attempted: false,
      success: false,
      shouldRetry: false,
      error: "No hay Expo Push Tokens validos",
      invalidTokens: [],
      invalidSubscriptions: []
    };
  }

  const failures = getPushFailureDetails(tickets);
  const successTickets = tickets.filter(({ ticket }) => ticket.status === "ok");
  const providerMessageId = successTickets
    .map(({ ticket }) => ("id" in ticket && typeof ticket.id === "string" ? ticket.id : null))
    .filter((value): value is string => Boolean(value))
    .join(",");

  const invalidTokens = failures
    .filter(({ message }) => /DeviceNotRegistered/i.test(message))
    .map(({ token }) => token);

  if (successTickets.length > 0) {
    return {
      attempted: true,
      success: true,
      shouldRetry: false,
      providerMessageId: providerMessageId || String(successTickets.length),
      error: failures.length ? failures.map(({ message }) => message).join(" | ") : undefined,
      invalidTokens,
      invalidSubscriptions: []
    };
  }

  return {
    attempted: true,
    success: false,
    shouldRetry: failures.some(
      ({ message }) => !/DeviceNotRegistered/i.test(message) && !isPermanentExpoFailure(message)
    ),
    error: failures.map(({ token, message }) => `${token}: ${message}`).join(" ; "),
    invalidTokens,
    invalidSubscriptions: []
  };
}

function summarizeWebPushDispatch(
  results: Awaited<ReturnType<typeof sendWebPushNotifications>>
): DispatchSummary {
  if (!results.length) {
    return {
      attempted: false,
      success: false,
      shouldRetry: false,
      error: "No hay suscripciones web push activas",
      invalidTokens: [],
      invalidSubscriptions: []
    };
  }

  const successes = results.filter((result) => result.success);
  const failures = results.filter((result) => !result.success);
  const invalidSubscriptions = failures.filter((result) => result.invalidSubscription).map((result) => result.endpoint);

  if (successes.length > 0) {
    return {
      attempted: true,
      success: true,
      shouldRetry: false,
      providerMessageId: successes
        .map((result) => result.providerMessageId)
        .filter((value): value is string => Boolean(value))
        .join(","),
      error: failures.length ? failures.map((result) => result.error).filter(Boolean).join(" | ") : undefined,
      invalidTokens: [],
      invalidSubscriptions
    };
  }

  return {
    attempted: true,
    success: false,
    shouldRetry: failures.some((result) => result.shouldRetry),
    error: failures.map((result) => `${result.endpoint}: ${result.error ?? "Error desconocido"}`).join(" ; "),
    invalidTokens: [],
    invalidSubscriptions
  };
}

function notificationTargetHref(data: Prisma.JsonValue | null | undefined) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "/dashboard/notificaciones";

  const record = data as Record<string, unknown>;
  const explicitHref = typeof record.href === "string" ? record.href : null;
  if (explicitHref) return explicitHref;

  const type = String(record.type ?? "");
  if (type.includes("ENROLLMENT")) return "/dashboard/inscripciones";
  if (type.includes("OVERDUE")) return "/dashboard/cobros/vencidos";
  if (type.includes("DUE")) return "/dashboard/cobros/pendientes";
  return "/dashboard/notificaciones";
}

async function updateNotificationForFailure(input: {
  notificationId: string;
  status: "PENDIENTE" | "FALLIDA";
  attemptCount: number;
  nextAttemptAt: Date;
  error: string;
}) {
  await prisma.notification.update({
    where: { id: input.notificationId },
    data: {
      status: input.status,
      attempts: input.attemptCount,
      nextAttemptAt: input.nextAttemptAt,
      error: input.error
    }
  });
}

export async function queueNotification(input: QueueNotificationInput): Promise<QueueNotificationResult> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    if (input.dedupKey) {
      const existing = await tx.notification.findUnique({
        where: { dedupKey: input.dedupKey },
        select: {
          id: true,
          sequence: true,
          status: true
        }
      });

      if (existing) {
        if (existing.status === "FALLIDA") {
          await reviveNotificationTx(tx, existing.id, input.clientId);
          return {
            notificationId: existing.id,
            sequence: existing.sequence,
            deduped: false
          };
        }

        return {
          notificationId: existing.id,
          sequence: existing.sequence,
          deduped: true
        };
      }
    }

    try {
      const notification = await tx.notification.create({
        data: {
          clientId: input.clientId,
          type: input.type,
          dedupKey: input.dedupKey,
          title: input.title,
          body: input.body,
          data: input.data ?? {},
          status: "PENDIENTE",
          nextAttemptAt: now
        },
        select: {
          id: true,
          sequence: true
        }
      });

      await tx.notificationOutbox.create({
        data: {
          notificationId: notification.id,
          clientId: input.clientId,
          status: "ENCOLADA",
          nextAttemptAt: now
        }
      });

      await tx.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          clientId: input.clientId,
          channel: "INBOX_SYNC",
          attempt: 1,
          status: "ENVIADA",
          sentAt: now
        }
      });

      return {
        notificationId: notification.id,
        sequence: notification.sequence,
        deduped: false
      };
    } catch (error) {
      if (
        input.dedupKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await tx.notification.findUnique({
          where: { dedupKey: input.dedupKey },
          select: {
            id: true,
            sequence: true,
            status: true
          }
        });

        if (existing) {
          if (existing.status === "FALLIDA") {
            await reviveNotificationTx(tx, existing.id, input.clientId);
            return {
              notificationId: existing.id,
              sequence: existing.sequence,
              deduped: false
            };
          }

          return {
            notificationId: existing.id,
            sequence: existing.sequence,
            deduped: true
          };
        }
      }

      throw error;
    }
  });
}

async function processSingleOutboxEntry(outboxId: string) {
  const now = new Date();

  const claimed = await prisma.notificationOutbox.updateMany({
    where: {
      id: outboxId,
      status: { in: ["ENCOLADA", "REINTENTANDO"] },
      nextAttemptAt: { lte: now }
    },
    data: {
      status: "PROCESANDO",
      processingStartedAt: now,
      lastAttemptAt: now,
      attemptCount: { increment: 1 }
    }
  });

  if (!claimed.count) {
    return { processed: false, sent: false, retried: false, failed: false, skippedNoTokens: false };
  }

  const outbox = await prisma.notificationOutbox.findUnique({
    where: { id: outboxId },
    include: {
      notification: {
        select: {
          id: true,
          clientId: true,
          title: true,
          body: true,
          data: true,
          sequence: true
        }
      }
    }
  });

  if (!outbox?.notification) {
    return { processed: false, sent: false, retried: false, failed: false, skippedNoTokens: false };
  }

  const currentAttempt = outbox.attemptCount;
  const notification = outbox.notification;

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      attempts: currentAttempt,
      nextAttemptAt: now,
      error: null
    }
  });

  const tokens = await prisma.pushToken.findMany({
    where: { clientId: notification.clientId, isActive: true },
    select: { token: true }
  });
  const webSubscriptions = await prisma.webPushSubscription.findMany({
    where: { clientId: notification.clientId, isActive: true },
    select: {
      endpoint: true,
      p256dh: true,
      auth: true,
      expirationTime: true
    }
  });

  if (!tokens.length && !webSubscriptions.length) {
    const exhausted = currentAttempt >= MAX_PROCESSING_ATTEMPTS;
    const error = "No hay dispositivos registrados para push";
    const nextAttemptAt = exhausted ? now : retryDate(currentAttempt);

    await upsertDeliveryResult({
      clientId: notification.clientId,
      notificationId: notification.id,
      channel: "EXPO",
      attempt: currentAttempt,
      status: "OMITIDA",
      error,
      failedAt: now
    });
    await upsertDeliveryResult({
      clientId: notification.clientId,
      notificationId: notification.id,
      channel: "WEB_PUSH",
      attempt: currentAttempt,
      status: "OMITIDA",
      error,
      failedAt: now
    });

    await prisma.notificationOutbox.update({
      where: { id: outbox.id },
      data: exhausted
        ? {
            status: "FALLIDA",
            processingStartedAt: null,
            lastError: error
          }
        : {
            status: "REINTENTANDO",
            processingStartedAt: null,
            nextAttemptAt,
            lastError: error
          }
    });

    await updateNotificationForFailure({
      notificationId: notification.id,
      status: exhausted ? "FALLIDA" : "PENDIENTE",
      attemptCount: currentAttempt,
      nextAttemptAt,
      error
    });

    return {
      processed: true,
      sent: false,
      retried: !exhausted,
      failed: exhausted,
      skippedNoTokens: true
    };
  }

  const payloadData = {
    ...((notification.data as Record<string, unknown> | null) ?? {}),
    href: notificationTargetHref(notification.data),
    notificationId: notification.id,
    sequence: notification.sequence
  };

  let expoDispatch: DispatchSummary = {
    attempted: false,
    success: false,
    shouldRetry: false,
    invalidTokens: [],
    invalidSubscriptions: []
  };
  let webDispatch: DispatchSummary = {
    attempted: false,
    success: false,
    shouldRetry: false,
    invalidTokens: [],
    invalidSubscriptions: []
  };

  if (tokens.length) {
    try {
      const tickets = await sendExpoPushNotifications(
        tokens.map((entry) => entry.token),
        notification.title,
        notification.body,
        payloadData
      );
      expoDispatch = summarizeExpoDispatch(tickets);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar por Expo";
      expoDispatch = {
        attempted: true,
        success: false,
        shouldRetry: !isPermanentExpoFailure(message),
        error: message,
        invalidTokens: [],
        invalidSubscriptions: []
      };
    }
  }

  if (webSubscriptions.length) {
    try {
      const results = await sendWebPushNotifications(webSubscriptions, {
        notificationId: notification.id,
        sequence: notification.sequence,
        title: notification.title,
        body: notification.body,
        data: payloadData
      });
      webDispatch = summarizeWebPushDispatch(results);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar por Web Push";
      webDispatch = {
        attempted: true,
        success: false,
        shouldRetry: true,
        error: message,
        invalidTokens: [],
        invalidSubscriptions: []
      };
    }
  }

  if (expoDispatch.invalidTokens.length) {
    await prisma.pushToken.updateMany({
      where: {
        clientId: notification.clientId,
        token: { in: expoDispatch.invalidTokens }
      },
      data: { isActive: false }
    });
  }

  if (webDispatch.invalidSubscriptions.length) {
    await prisma.webPushSubscription.updateMany({
      where: {
        clientId: notification.clientId,
        endpoint: { in: webDispatch.invalidSubscriptions }
      },
      data: { isActive: false }
    });
  }

  if (expoDispatch.attempted) {
    await upsertDeliveryResult({
      clientId: notification.clientId,
      notificationId: notification.id,
      channel: "EXPO",
      attempt: currentAttempt,
      status: expoDispatch.success ? "ENVIADA" : "FALLIDA",
      providerMessageId: expoDispatch.providerMessageId,
      error: expoDispatch.error ?? null,
      sentAt: expoDispatch.success ? now : null,
      failedAt: expoDispatch.success ? null : now
    });
  }

  if (webDispatch.attempted) {
    await upsertDeliveryResult({
      clientId: notification.clientId,
      notificationId: notification.id,
      channel: "WEB_PUSH",
      attempt: currentAttempt,
      status: webDispatch.success ? "ENVIADA" : "FALLIDA",
      providerMessageId: webDispatch.providerMessageId,
      error: webDispatch.error ?? null,
      sentAt: webDispatch.success ? now : null,
      failedAt: webDispatch.success ? null : now
    });
  }

  const anySuccess = expoDispatch.success || webDispatch.success;

  if (anySuccess) {
    const sentAt = new Date();
    const combinedError = [expoDispatch.error, webDispatch.error].filter(Boolean).join(" | ") || null;

    await prisma.notificationOutbox.update({
      where: { id: outbox.id },
      data: {
        status: "ENVIADA",
        processingStartedAt: null,
        sentAt,
        lastError: combinedError
      }
    });

    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: "ENVIADA",
        attempts: currentAttempt,
        nextAttemptAt: sentAt,
        sentAt,
        error: combinedError
      }
    });

    return { processed: true, sent: true, retried: false, failed: false, skippedNoTokens: false };
  }

  const exhausted = currentAttempt >= MAX_PROCESSING_ATTEMPTS;
  const shouldRetry = !exhausted && (expoDispatch.shouldRetry || webDispatch.shouldRetry);
  const error =
    [expoDispatch.error, webDispatch.error].filter(Boolean).join(" | ") ||
    "No se pudo enviar la notificacion por ningun canal push";
  const nextAttemptAt = shouldRetry ? retryDate(currentAttempt) : now;

  await prisma.notificationOutbox.update({
    where: { id: outbox.id },
    data: shouldRetry
      ? {
          status: "REINTENTANDO",
          processingStartedAt: null,
          nextAttemptAt,
          lastError: error
        }
      : {
          status: "FALLIDA",
          processingStartedAt: null,
          lastError: error
        }
  });

  await updateNotificationForFailure({
    notificationId: notification.id,
    status: shouldRetry ? "PENDIENTE" : "FALLIDA",
    attemptCount: currentAttempt,
    nextAttemptAt,
    error
  });

  return {
    processed: true,
    sent: false,
    retried: shouldRetry,
    failed: !shouldRetry,
    skippedNoTokens: false
  };
}

async function processClientQueue(clientId: string, limit: number, deadline: number) {
  const summary = { processed: 0, sent: 0, retried: 0, failed: 0, skippedNoTokens: 0, timedOut: false };

  // El lote se consulta UNA sola vez. Antes el findMany estaba dentro del while y
  // traia `limit` filas para procesar una sola: con limit=100 eran 100 consultas
  // de 100 filas (10.000 filas leidas) por corrida del cron.
  const candidates = await prisma.notificationOutbox.findMany({
    where: {
      clientId,
      status: { in: ["ENCOLADA", "REINTENTANDO"] },
      nextAttemptAt: { lte: new Date() }
    },
    select: {
      id: true,
      notification: {
        select: { sequence: true }
      }
    },
    orderBy: { notification: { sequence: "asc" } },
    take: limit
  });

  for (const entry of candidates) {
    if (summary.processed >= limit) break;
    if (outOfTime(deadline)) {
      summary.timedOut = true;
      break;
    }

    const result = await processSingleOutboxEntry(entry.id);
    if (!result.processed) continue;

    summary.processed += 1;
    if (result.sent) summary.sent += 1;
    if (result.retried) summary.retried += 1;
    if (result.failed) summary.failed += 1;
    if (result.skippedNoTokens) summary.skippedNoTokens += 1;
  }

  return summary;
}

export async function repairStuckNotificationOutbox() {
  const repaired = await prisma.notificationOutbox.updateMany({
    where: {
      status: "PROCESANDO",
      processingStartedAt: { lt: staleProcessingDate() }
    },
    data: {
      status: "REINTENTANDO",
      processingStartedAt: null,
      nextAttemptAt: new Date(),
      lastError: "Procesamiento recuperado por el job de reparacion"
    }
  });

  if (repaired.count) {
    await prisma.notification.updateMany({
      where: {
        outbox: {
          is: {
            status: "REINTENTANDO",
            processingStartedAt: null,
            lastError: "Procesamiento recuperado por el job de reparacion"
          }
        },
        status: "PENDIENTE"
      },
      data: {
        error: "Procesamiento recuperado por el job de reparacion"
      }
    });
  }

  return repaired.count;
}

async function repairSentWithoutSuccessfulPush(limit = 100) {
  const outboxes = await prisma.notificationOutbox.findMany({
    where: {
      status: "ENVIADA",
      attemptCount: { lt: MAX_PROCESSING_ATTEMPTS },
      notification: {
        is: {
          deliveredAt: null,
          readAt: null,
          deliveries: {
            some: {
              channel: "EXPO",
              status: "FALLIDA"
            }
          }
        }
      }
    },
    select: {
      id: true,
      notificationId: true
    },
    take: limit
  });

  if (!outboxes.length) return 0;

  const outboxIds = outboxes.map((entry) => entry.id);
  const notificationIds = outboxes.map((entry) => entry.notificationId);
  const now = new Date();
  const message = "Reintentando push marcado como enviado sin entrega consistente";

  await prisma.notificationOutbox.updateMany({
    where: { id: { in: outboxIds } },
    data: {
      status: "REINTENTANDO",
      sentAt: null,
      processingStartedAt: null,
      nextAttemptAt: now,
      lastError: message
    }
  });

  await prisma.notification.updateMany({
    where: { id: { in: notificationIds } },
    data: {
      status: "PENDIENTE",
      sentAt: null,
      nextAttemptAt: now,
      error: message
    }
  });

  return outboxes.length;
}

export async function processNotificationQueue(
  limit = DEFAULT_BATCH_LIMIT,
  options?: { deadline?: number }
): Promise<NotificationQueueSummary> {
  const deadline = options?.deadline ?? newDeadline();
  const repaired = await repairStuckNotificationOutbox();
  const repairedSentWithoutDelivery = await repairSentWithoutSuccessfulPush();
  const dueEntries = await prisma.notificationOutbox.findMany({
    where: {
      status: { in: ["ENCOLADA", "REINTENTANDO"] },
      nextAttemptAt: { lte: new Date() }
    },
    select: {
      clientId: true,
      notification: {
        select: {
          sequence: true
        }
      }
    },
    take: limit * 3
  });

  const clientsByPriority = Array.from(
    dueEntries.reduce((map, entry) => {
      const current = map.get(entry.clientId) ?? Number.MAX_SAFE_INTEGER;
      map.set(entry.clientId, Math.min(current, entry.notification.sequence));
      return map;
    }, new Map<string, number>())
  )
    .sort((left, right) => left[1] - right[1])
    .map(([clientId]) => clientId);

  const summary: NotificationQueueSummary = {
    repaired,
    repairedSentWithoutDelivery,
    clientsLocked: 0,
    processed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skippedNoTokens: 0,
    timedOut: false
  };

  for (const clientId of clientsByPriority) {
    if (summary.processed >= limit) break;
    if (outOfTime(deadline)) {
      summary.timedOut = true;
      break;
    }

    const locked = await tryAcquireClientLock(clientId);
    if (!locked) continue;

    summary.clientsLocked += 1;

    try {
      const result = await processClientQueue(clientId, limit - summary.processed, deadline);
      summary.processed += result.processed;
      summary.sent += result.sent;
      summary.retried += result.retried;
      summary.failed += result.failed;
      summary.skippedNoTokens += result.skippedNoTokens;
      if (result.timedOut) summary.timedOut = true;
    } finally {
      await releaseClientLock(clientId);
    }
  }

  return summary;
}

export async function requeuePushNotificationsForClient(clientId: string, options?: { limit?: number }) {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const outboxes = await prisma.notificationOutbox.findMany({
    where: {
      clientId,
      OR: [
        { lastError: { contains: "No hay dispositivos registrados para push" } },
        { notification: { error: { contains: "No hay dispositivos registrados para push" } } }
      ]
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      notificationId: true
    }
  });

  if (!outboxes.length) return { requeued: 0 };

  const now = new Date();
  const outboxIds = outboxes.map((entry) => entry.id);
  const notificationIds = outboxes.map((entry) => entry.notificationId);

  await prisma.notificationOutbox.updateMany({
    where: { id: { in: outboxIds }, clientId },
    data: {
      status: "ENCOLADA",
      attemptCount: 0,
      nextAttemptAt: now,
      processingStartedAt: null,
      lastAttemptAt: null,
      sentAt: null,
      lastError: null
    }
  });

  await prisma.notification.updateMany({
    where: { id: { in: notificationIds }, clientId },
    data: {
      status: "PENDIENTE",
      attempts: 0,
      nextAttemptAt: now,
      sentAt: null,
      error: null
    }
  });

  return { requeued: outboxes.length };
}

export async function getNotificationsForClient(clientId: string, afterSequence = 0, limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return prisma.notification.findMany({
    where: {
      clientId,
      sequence: { gt: Math.max(afterSequence, 0) },
      deliveries: {
        some: {
          channel: "INBOX_SYNC",
          status: { in: ["ENVIADA", "ENTREGADA"] }
        }
      }
    },
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

  if (!ids.length && sequenceCap <= 0) {
    return { updated: 0, lastDeliveredSequence: 0 };
  }

  return prisma.$transaction(async (tx) => {
    const conditions: Prisma.NotificationWhereInput[] = [];
    if (ids.length) conditions.push({ id: { in: ids } });
    if (sequenceCap > 0) conditions.push({ sequence: { lte: sequenceCap } });

    const targets = await tx.notification.findMany({
      where: { clientId, OR: conditions },
      select: { id: true, sequence: true }
    });

    if (!targets.length) {
      return { updated: 0, lastDeliveredSequence: sequenceCap };
    }

    const now = new Date();
    const targetIds = targets.map((notification) => notification.id);
    const maxSequence = Math.max(sequenceCap, ...targets.map((notification) => notification.sequence));

    await tx.notification.updateMany({
      where: { id: { in: targetIds }, clientId, deliveredAt: null },
      data: { deliveredAt: now }
    });

    await tx.notificationDelivery.updateMany({
      where: {
        notificationId: { in: targetIds },
        channel: { in: ["INBOX_SYNC", "EXPO", "WEB_PUSH"] }
      },
      data: {
        status: "ENTREGADA",
        deliveredAt: now
      }
    });

    return { updated: targetIds.length, lastDeliveredSequence: maxSequence };
  });
}

export async function markNotificationsRead(
  clientId: string,
  input: { notificationIds?: string[]; uptoSequence?: number }
) {
  const ids = input.notificationIds?.filter(Boolean) ?? [];
  const sequenceCap = input.uptoSequence ?? 0;

  if (!ids.length && sequenceCap <= 0) {
    return { updated: 0, lastReadSequence: 0 };
  }

  return prisma.$transaction(async (tx) => {
    const conditions: Prisma.NotificationWhereInput[] = [];
    if (ids.length) conditions.push({ id: { in: ids } });
    if (sequenceCap > 0) conditions.push({ sequence: { lte: sequenceCap } });

    const targets = await tx.notification.findMany({
      where: { clientId, OR: conditions },
      select: { id: true, sequence: true }
    });

    if (!targets.length) {
      return { updated: 0, lastReadSequence: sequenceCap };
    }

    const now = new Date();
    const targetIds = targets.map((notification) => notification.id);
    const maxSequence = Math.max(sequenceCap, ...targets.map((notification) => notification.sequence));

    await tx.notification.updateMany({
      where: { id: { in: targetIds }, clientId },
      data: { status: "LEIDA", deliveredAt: now, readAt: now }
    });

    await tx.notificationDelivery.updateMany({
      where: {
        notificationId: { in: targetIds },
        channel: { in: ["INBOX_SYNC", "EXPO", "WEB_PUSH"] }
      },
      data: {
        status: "ENTREGADA",
        deliveredAt: now
      }
    });

    return { updated: targetIds.length, lastReadSequence: maxSequence };
  });
}
