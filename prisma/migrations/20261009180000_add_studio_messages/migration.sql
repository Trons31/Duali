-- Spec 011 (avisos del estudio). Solo aditivo: enum y tabla nueva.
-- CreateEnum
CREATE TYPE "StudioMessageType" AS ENUM ('RECORDATORIO_CLASE', 'PAQUETE_POR_VENCER', 'SALDO', 'CLASE_CANCELADA');

-- CreateTable
CREATE TABLE "studio_messages" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tipo" "StudioMessageType" NOT NULL,
    "refKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_messages_memberId_idx" ON "studio_messages"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "studio_messages_clientId_tipo_refKey_key" ON "studio_messages"("clientId", "tipo", "refKey");

-- AddForeignKey
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "studio_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

