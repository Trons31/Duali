-- Spec 006 (clientes y ventas del estudio). Solo aditivo: tablas nuevas.
-- CreateTable
CREATE TABLE "studio_members" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT,
    "celular" TEXT NOT NULL,
    "email" TEXT,
    "fechaNacimiento" DATE,
    "notas" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "studio_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_packages" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clases" INTEGER NOT NULL,
    "clasesUsadas" INTEGER NOT NULL DEFAULT 0,
    "precio" DECIMAL(12,2) NOT NULL,
    "pagado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inicio" DATE NOT NULL,
    "vence" DATE NOT NULL,
    "anuladoAt" TIMESTAMP(3),
    "motivoAnulacion" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_package_payments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "memberPackageId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "notas" TEXT,
    "anuladoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_package_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_members_clientId_deletedAt_idx" ON "studio_members"("clientId", "deletedAt");

-- CreateIndex
CREATE INDEX "studio_members_studentId_idx" ON "studio_members"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "studio_members_clientId_celular_key" ON "studio_members"("clientId", "celular");

-- CreateIndex
CREATE INDEX "member_packages_clientId_vence_idx" ON "member_packages"("clientId", "vence");

-- CreateIndex
CREATE INDEX "member_packages_memberId_idx" ON "member_packages"("memberId");

-- CreateIndex
CREATE INDEX "member_packages_packageId_idx" ON "member_packages"("packageId");

-- CreateIndex
CREATE INDEX "member_package_payments_clientId_fecha_idx" ON "member_package_payments"("clientId", "fecha");

-- CreateIndex
CREATE INDEX "member_package_payments_memberPackageId_idx" ON "member_package_payments"("memberPackageId");

-- AddForeignKey
ALTER TABLE "studio_members" ADD CONSTRAINT "studio_members_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_members" ADD CONSTRAINT "studio_members_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_packages" ADD CONSTRAINT "member_packages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_packages" ADD CONSTRAINT "member_packages_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "studio_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_packages" ADD CONSTRAINT "member_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_packages" ADD CONSTRAINT "member_packages_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_package_payments" ADD CONSTRAINT "member_package_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_package_payments" ADD CONSTRAINT "member_package_payments_memberPackageId_fkey" FOREIGN KEY ("memberPackageId") REFERENCES "member_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

