-- AlterTable
ALTER TABLE "notification_deliveries" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_outbox" ALTER COLUMN "updatedAt" DROP DEFAULT;
