CREATE TYPE "NotificationQueueStatus" AS ENUM ('ENCOLADA', 'PROCESANDO', 'REINTENTANDO', 'ENVIADA', 'FALLIDA');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('OMITIDA', 'ENVIADA', 'ENTREGADA', 'FALLIDA');
CREATE TYPE "NotificationChannel" AS ENUM ('INBOX_SYNC', 'EXPO');

CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "NotificationQueueStatus" NOT NULL DEFAULT 'ENCOLADA',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'ENVIADA',
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_outbox_notificationId_key" ON "notification_outbox"("notificationId");
CREATE INDEX "notification_outbox_clientId_status_idx" ON "notification_outbox"("clientId", "status");
CREATE INDEX "notification_outbox_status_nextAttemptAt_idx" ON "notification_outbox"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "notification_deliveries_notificationId_channel_key" ON "notification_deliveries"("notificationId", "channel");
CREATE INDEX "notification_deliveries_clientId_channel_idx" ON "notification_deliveries"("clientId", "channel");
CREATE INDEX "notification_deliveries_notificationId_status_idx" ON "notification_deliveries"("notificationId", "status");

ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "notification_outbox" (
    "id",
    "notificationId",
    "clientId",
    "status",
    "attemptCount",
    "nextAttemptAt",
    "sentAt",
    "lastError",
    "createdAt",
    "updatedAt"
)
SELECT
    concat('out_', md5(random()::text || clock_timestamp()::text || n."id")),
    n."id",
    n."clientId",
    CASE
        WHEN n."status" = 'FALLIDA' THEN 'FALLIDA'::"NotificationQueueStatus"
        WHEN n."status" IN ('ENVIADA', 'LEIDA') OR n."sentAt" IS NOT NULL THEN 'ENVIADA'::"NotificationQueueStatus"
        ELSE 'ENCOLADA'::"NotificationQueueStatus"
    END,
    COALESCE(n."attempts", 0),
    COALESCE(n."nextAttemptAt", CURRENT_TIMESTAMP),
    n."sentAt",
    n."error",
    n."createdAt",
    n."updatedAt"
FROM "notifications" n
LEFT JOIN "notification_outbox" o ON o."notificationId" = n."id"
WHERE o."id" IS NULL;

INSERT INTO "notification_deliveries" (
    "id",
    "notificationId",
    "clientId",
    "channel",
    "attempt",
    "status",
    "sentAt",
    "deliveredAt",
    "failedAt",
    "lastError",
    "createdAt",
    "updatedAt"
)
SELECT
    concat('del_', md5(random()::text || clock_timestamp()::text || n."id")),
    n."id",
    n."clientId",
    'INBOX_SYNC'::"NotificationChannel",
    1,
    CASE
        WHEN n."readAt" IS NOT NULL OR n."deliveredAt" IS NOT NULL THEN 'ENTREGADA'::"NotificationDeliveryStatus"
        WHEN n."status" = 'FALLIDA' THEN 'FALLIDA'::"NotificationDeliveryStatus"
        ELSE 'ENVIADA'::"NotificationDeliveryStatus"
    END,
    n."createdAt",
    n."deliveredAt",
    CASE WHEN n."status" = 'FALLIDA' THEN n."updatedAt" ELSE NULL END,
    n."error",
    n."createdAt",
    n."updatedAt"
FROM "notifications" n
LEFT JOIN "notification_deliveries" d
    ON d."notificationId" = n."id" AND d."channel" = 'INBOX_SYNC'
WHERE d."id" IS NULL;
