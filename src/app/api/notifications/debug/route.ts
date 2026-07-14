import { Expo } from "expo-server-sdk";
import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function buildHints(input: {
  activeTokenCount: number;
  duePendingCount: number;
  failedCount: number;
  failedOutboxCount: number;
  recentErrors: string[];
}) {
  const hints: string[] = [];

  if (!input.activeTokenCount) {
    hints.push("No hay push tokens activos para este cliente.");
  }

  if (input.duePendingCount > 0) {
    hints.push("Hay notificaciones en cola que ya deberian haberse procesado.");
  }

  if (input.failedCount > 0 || input.failedOutboxCount > 0) {
    hints.push("Hay fallos recientes en la cola o en la entrega; revisa los errores recientes.");
  }

  if (input.recentErrors.some((error) => /No hay dispositivos registrados para push/i.test(error))) {
    hints.push("El backend intento enviar antes de que el dispositivo registrara un token activo.");
  }

  if (input.recentErrors.some((error) => /DeviceNotRegistered/i.test(error))) {
    hints.push("Expo reporto tokens vencidos o invalidados por el dispositivo.");
  }

  if (input.recentErrors.some((error) => /MismatchSenderId|InvalidCredentials|FCM|credentials/i.test(error))) {
    hints.push("El fallo apunta a configuracion de Expo/FCM para Android.");
  }

  if (input.recentErrors.some((error) => /Procesamiento recuperado por el job de reparacion/i.test(error))) {
    hints.push("Se detectaron trabajos de cola atascados y fueron recuperados automaticamente.");
  }

  return hints;
}

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const now = new Date();

    const tokens = await prisma.pushToken.findMany({
      where: { clientId },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        token: true,
        platform: true,
        deviceName: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    const recentNotifications = await prisma.notification.findMany({
      where: { clientId },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        sequence: true,
        type: true,
        title: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        error: true,
        createdAt: true,
        updatedAt: true
      }
    });
    const recentOutbox = await prisma.notificationOutbox.findMany({
      where: { clientId },
      orderBy: [{ updatedAt: "desc" }],
      take: 20,
      select: {
        id: true,
        notificationId: true,
        status: true,
        attemptCount: true,
        nextAttemptAt: true,
        processingStartedAt: true,
        lastAttemptAt: true,
        sentAt: true,
        lastError: true,
        createdAt: true,
        updatedAt: true
      }
    });
    const recentDeliveries = await prisma.notificationDelivery.findMany({
      where: { clientId },
      orderBy: [{ updatedAt: "desc" }],
      take: 20,
      select: {
        id: true,
        notificationId: true,
        channel: true,
        attempt: true,
        status: true,
        providerMessageId: true,
        lastError: true,
        sentAt: true,
        deliveredAt: true,
        failedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    const notificationCounts = await prisma.notification.groupBy({
      by: ["status"],
      where: { clientId },
      _count: { _all: true }
    });
    const outboxCounts = await prisma.notificationOutbox.groupBy({
      by: ["status"],
      where: { clientId },
      _count: { _all: true }
    });
    const deliveryCounts = await prisma.notificationDelivery.groupBy({
      by: ["channel", "status"],
      where: { clientId },
      _count: { _all: true }
    });

    const duePendingCount = await prisma.notificationOutbox.count({
      where: {
        clientId,
        status: { in: ["ENCOLADA", "REINTENTANDO"] },
        nextAttemptAt: { lte: now }
      }
    });

    const pendingFutureCount = await prisma.notificationOutbox.count({
      where: {
        clientId,
        status: { in: ["ENCOLADA", "REINTENTANDO"] },
        nextAttemptAt: { gt: now }
      }
    });

    const activeTokenCount = tokens.filter((token) => token.isActive).length;
    const recentErrors = [
      ...recentNotifications.map((notification) => notification.error),
      ...recentOutbox.map((entry) => entry.lastError),
      ...recentDeliveries.map((delivery) => delivery.lastError)
    ].filter((error): error is string => Boolean(error));

    return ok({
      serverTime: now.toISOString(),
      summary: {
        activeTokenCount,
        totalTokenCount: tokens.length,
        duePendingCount,
        pendingFutureCount,
        notificationCounts: notificationCounts.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.status] = entry._count._all;
          return acc;
        }, {}),
        outboxCounts: outboxCounts.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.status] = entry._count._all;
          return acc;
        }, {}),
        deliveryCounts: deliveryCounts.reduce<Record<string, number>>((acc, entry) => {
          acc[`${entry.channel}:${entry.status}`] = entry._count._all;
          return acc;
        }, {})
      },
      tokens: tokens.map((token) => ({
        ...token,
        isExpoPushToken: Expo.isExpoPushToken(token.token)
      })),
      recentNotifications,
      recentOutbox,
      recentDeliveries,
      hints: buildHints({
        activeTokenCount,
        duePendingCount,
        failedCount: notificationCounts.find((entry) => entry.status === "FALLIDA")?._count._all ?? 0,
        failedOutboxCount: outboxCounts.find((entry) => entry.status === "FALLIDA")?._count._all ?? 0,
        recentErrors
      })
    });
  } catch (error) {
    return handleError(error);
  }
}
