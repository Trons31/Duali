import webpush from "web-push";
import { WEB_NOTIFICATION_ICON_URL } from "@/lib/branding";
import { prisma } from "@/lib/prisma";

type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: bigint | null;
};

export type WebPushSendResult = {
  endpoint: string;
  success: boolean;
  statusCode?: number;
  providerMessageId?: string;
  shouldRetry: boolean;
  invalidSubscription: boolean;
  error?: string;
};

function defaultWebPushSubject() {
  return process.env.WEB_PUSH_SUBJECT ?? "mailto:admin@duali.local";
}

async function getStoredWebPushConfig() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = defaultWebPushSubject();

  if (publicKey && privateKey) {
    return { publicKey, privateKey, subject };
  }

  const existing = await prisma.webPushConfig.findUnique({
    where: { id: "default" }
  });

  if (existing) {
    return {
      publicKey: existing.publicKey,
      privateKey: existing.privateKey,
      subject: existing.subject
    };
  }

  const generated = webpush.generateVAPIDKeys();
  const created = await prisma.webPushConfig.create({
    data: {
      id: "default",
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject
    }
  });

  return {
    publicKey: created.publicKey,
    privateKey: created.privateKey,
    subject: created.subject
  };
}

function isRetryableStatus(statusCode?: number) {
  if (!statusCode) return true;
  return statusCode >= 500 || statusCode === 429;
}

function isInvalidSubscriptionStatus(statusCode?: number) {
  return statusCode === 404 || statusCode === 410;
}

function serializeExpirationTime(expirationTime: bigint | null) {
  if (expirationTime == null) return null;
  const numeric = Number(expirationTime);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function getWebPushPublicKey() {
  const config = await getStoredWebPushConfig();
  return config.publicKey;
}

export async function sendWebPushNotifications(
  subscriptions: StoredSubscription[],
  payload: {
    notificationId: string;
    sequence: number;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }
) {
  if (!subscriptions.length) return [] satisfies WebPushSendResult[];

  const config = await getStoredWebPushConfig();
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: WEB_NOTIFICATION_ICON_URL,
    badge: WEB_NOTIFICATION_ICON_URL,
    tag: `notification-${payload.notificationId}`,
    data: {
      ...payload.data,
      notificationId: payload.notificationId,
      sequence: payload.sequence
    }
  });

  const results = await Promise.all(
    subscriptions.map(async (subscription): Promise<WebPushSendResult> => {
      try {
        const response = await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: serializeExpirationTime(subscription.expirationTime),
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          message,
          {
            TTL: 3600,
            urgency: "high"
          }
        );

        return {
          endpoint: subscription.endpoint,
          success: true,
          shouldRetry: false,
          invalidSubscription: false,
          providerMessageId: response.headers?.["location"] ?? undefined,
          statusCode: response.statusCode
        };
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number"
            ? error.statusCode
            : undefined;
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error && "body" in error && typeof error.body === "string"
              ? error.body
              : "No se pudo enviar la notificacion web";

        return {
          endpoint: subscription.endpoint,
          success: false,
          statusCode,
          shouldRetry: isRetryableStatus(statusCode),
          invalidSubscription: isInvalidSubscriptionStatus(statusCode),
          error: message
        };
      }
    })
  );

  return results;
}
