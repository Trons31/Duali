-- Spec 021 (comprar un plan en linea). Solo aditivo: columnas con default o nulas.
-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "exigirPagoValidado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permitirPagoEnEstudio" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "member_packages" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "origen" "BookingOrigin" NOT NULL DEFAULT 'PANEL';

-- AlterTable
ALTER TABLE "payment_receipts" ADD COLUMN     "metodoPago" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "member_packages_accessToken_key" ON "member_packages"("accessToken");
