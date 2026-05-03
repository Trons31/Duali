ALTER TABLE "notifications"
ADD COLUMN "sequence" SERIAL,
ADD COLUMN "deliveredAt" TIMESTAMP(3);

CREATE INDEX "notifications_clientId_sequence_idx" ON "notifications"("clientId", "sequence");
