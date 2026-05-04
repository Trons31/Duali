import { Expo } from "expo-server-sdk";
import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function buildHints(input: {
  activeTokenCount: number;
  duePendingCount: number;
  failedCount: number;
  recentErrors: string[];
}) {
  const hints: string[] = [];

  if (!input.activeTokenCount) {
    hints.push("No hay push tokens activos para este cliente.");
  }

  if (input.duePendingCount > 0) {
    hints.push("Hay notificaciones pendientes que ya deberian haberse procesado.");
  }

  if (input.failedCount > 0) {
    hints.push("Hay notificaciones fallidas; revisa los errores recientes para identificar si es token o credenciales.");
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

  return hints;
}

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const now = new Date();

    const [tokens, recentNotifications, counts] = await Promise.all([
      prisma.pushToken.findMany({
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
      }),
      prisma.notification.findMany({
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
      }),
      prisma.notification.groupBy({
        by: ["status"],
        where: { clientId },
        _count: { _all: true }
      })
    ]);

    const duePendingCount = await prisma.notification.count({
      where: {
        clientId,
        status: "PENDIENTE",
        attempts: { lt: 5 },
        nextAttemptAt: { lte: now }
      }
    });

    const pendingFutureCount = await prisma.notification.count({
      where: {
        clientId,
        status: "PENDIENTE",
        nextAttemptAt: { gt: now }
      }
    });

    const activeTokenCount = tokens.filter((token) => token.isActive).length;
    const recentErrors = recentNotifications.map((notification) => notification.error).filter((error): error is string => Boolean(error));

    return ok({
      serverTime: now.toISOString(),
      summary: {
        activeTokenCount,
        totalTokenCount: tokens.length,
        duePendingCount,
        pendingFutureCount,
        counts: counts.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.status] = entry._count._all;
          return acc;
        }, {})
      },
      tokens: tokens.map((token) => ({
        ...token,
        isExpoPushToken: Expo.isExpoPushToken(token.token)
      })),
      recentNotifications,
      hints: buildHints({
        activeTokenCount,
        duePendingCount,
        failedCount: counts.find((entry) => entry.status === "FALLIDA")?._count._all ?? 0,
        recentErrors
      })
    });
  } catch (error) {
    return handleError(error);
  }
}
