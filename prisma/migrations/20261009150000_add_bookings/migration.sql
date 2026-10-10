-- Spec 007 (reservas). Solo aditivo: enums, tabla nueva y una columna con DEFAULT.
-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('RESERVADA', 'ASISTIO', 'NO_ASISTIO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "BookingOrigin" AS ENUM ('PANEL', 'PUBLICO');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "horasCancelacion" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberPackageId" TEXT NOT NULL,
    "estado" "BookingStatus" NOT NULL DEFAULT 'RESERVADA',
    "origen" "BookingOrigin" NOT NULL DEFAULT 'PANEL',
    "canceladaAt" TIMESTAMP(3),
    "claseDevuelta" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bookings_clientId_idx" ON "bookings"("clientId");

-- CreateIndex
CREATE INDEX "bookings_memberId_idx" ON "bookings"("memberId");

-- CreateIndex
CREATE INDEX "bookings_memberPackageId_idx" ON "bookings"("memberPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_sessionId_memberId_key" ON "bookings"("sessionId", "memberId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "studio_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_memberPackageId_fkey" FOREIGN KEY ("memberPackageId") REFERENCES "member_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

