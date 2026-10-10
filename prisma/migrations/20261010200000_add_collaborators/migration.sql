-- Spec 024 (colaboradores con acceso: administradores y socios). Solo aditivo: una tabla y un tipo nuevos.
-- CreateEnum
CREATE TYPE "CollaboratorRole" AS ENUM ('ADMIN', 'SOCIO');

-- CreateTable
CREATE TABLE "collaborators" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "celular" TEXT,
    "passwordHash" TEXT NOT NULL,
    "rol" "CollaboratorRole" NOT NULL DEFAULT 'ADMIN',
    "permisos" JSONB NOT NULL DEFAULT '{}',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcceso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collaborators_email_key" ON "collaborators"("email");

-- CreateIndex
CREATE INDEX "collaborators_clientId_activo_idx" ON "collaborators"("clientId", "activo");

-- AddForeignKey
ALTER TABLE "collaborators" ADD CONSTRAINT "collaborators_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;


