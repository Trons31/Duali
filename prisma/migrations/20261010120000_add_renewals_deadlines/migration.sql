-- Spec 020 (renovaciones, pagos y vencimientos). Solo aditivo: columnas con default o nulas.
-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "diasPlazoSaldo" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "member_packages" ADD COLUMN     "fechaLimitePago" DATE,
ADD COLUMN     "renovacionDeId" TEXT;

-- CreateIndex
CREATE INDEX "member_packages_renovacionDeId_idx" ON "member_packages"("renovacionDeId");

-- AddForeignKey
ALTER TABLE "member_packages" ADD CONSTRAINT "member_packages_renovacionDeId_fkey" FOREIGN KEY ("renovacionDeId") REFERENCES "member_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
