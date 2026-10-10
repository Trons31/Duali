-- Spec 014 (comprobantes web). Solo aditivo: enum y tabla nueva.
-- CreateEnum
CREATE TYPE "PaymentReceiptStatus" AS ENUM ('POR_REVISAR', 'APROBADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "memberPackageId" TEXT NOT NULL,
    "bookingId" TEXT,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "estado" "PaymentReceiptStatus" NOT NULL DEFAULT 'POR_REVISAR',
    "paymentId" TEXT,
    "motivoRechazo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_receipts_clientId_estado_idx" ON "payment_receipts"("clientId", "estado");

-- CreateIndex
CREATE INDEX "payment_receipts_memberPackageId_idx" ON "payment_receipts"("memberPackageId");

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_memberPackageId_fkey" FOREIGN KEY ("memberPackageId") REFERENCES "member_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

