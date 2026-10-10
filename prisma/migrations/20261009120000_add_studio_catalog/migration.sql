-- Specs 002-004 (Modo Estudio). Solo aditivo: columnas con DEFAULT y tablas nuevas.
-- CreateEnum
CREATE TYPE "DisciplineKind" AS ENUM ('CLASE', 'COMBO');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "moduloAcademia" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "moduloEstudio" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "disciplines" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tipo" "DisciplineKind" NOT NULL DEFAULT 'CLASE',
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "color" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipline_combo_items" (
    "comboId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,

    CONSTRAINT "discipline_combo_items_pkey" PRIMARY KEY ("comboId","disciplineId")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clases" INTEGER NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "vigenciaDias" INTEGER NOT NULL DEFAULT 30,
    "visiblePublico" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disciplines_clientId_idx" ON "disciplines"("clientId");

-- CreateIndex
CREATE INDEX "disciplines_clientId_deletedAt_idx" ON "disciplines"("clientId", "deletedAt");

-- CreateIndex
CREATE INDEX "discipline_combo_items_disciplineId_idx" ON "discipline_combo_items"("disciplineId");

-- CreateIndex
CREATE INDEX "packages_clientId_idx" ON "packages"("clientId");

-- CreateIndex
CREATE INDEX "packages_disciplineId_idx" ON "packages"("disciplineId");

-- CreateIndex
CREATE INDEX "packages_clientId_deletedAt_idx" ON "packages"("clientId", "deletedAt");

-- AddForeignKey
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_combo_items" ADD CONSTRAINT "discipline_combo_items_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "disciplines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_combo_items" ADD CONSTRAINT "discipline_combo_items_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

