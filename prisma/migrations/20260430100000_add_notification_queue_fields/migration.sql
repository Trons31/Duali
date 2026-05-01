ALTER TABLE "notifications"
ADD COLUMN "type" TEXT,
ADD COLUMN "dedupKey" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "notifications_dedupKey_key" ON "notifications"("dedupKey");
CREATE INDEX "notifications_status_nextAttemptAt_idx" ON "notifications"("status", "nextAttemptAt");
CREATE INDEX "notifications_clientId_type_idx" ON "notifications"("clientId", "type");
