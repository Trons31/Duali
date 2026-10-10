-- Spec 015 (lista de espera). Solo aditivo: enum, tabla nueva y un valor de enum.
-- AlterEnum
ALTER TYPE "StudioMessageType" ADD VALUE 'CUPO_LISTA_ESPERA';

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('EN_ESPERA', 'ASIGNADA', 'SALIO');

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "packageId" TEXT,
    "accessToken" TEXT NOT NULL,
    "estado" "WaitlistStatus" NOT NULL DEFAULT 'EN_ESPERA',
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_accessToken_key" ON "waitlist_entries"("accessToken");

-- CreateIndex
CREATE INDEX "waitlist_entries_clientId_estado_idx" ON "waitlist_entries"("clientId", "estado");

-- CreateIndex
CREATE INDEX "waitlist_entries_sessionId_estado_createdAt_idx" ON "waitlist_entries"("sessionId", "estado", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_sessionId_memberId_key" ON "waitlist_entries"("sessionId", "memberId");

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "studio_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
