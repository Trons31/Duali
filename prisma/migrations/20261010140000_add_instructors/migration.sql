-- Spec 023 fase 1 (instructores, titular y reemplazos). Solo aditivo: tablas nuevas y columnas nulas.
-- CreateEnum
CREATE TYPE "InstructorVariable" AS ENUM ('POR_CLASE', 'ALUMNO_FIJO', 'ALUMNO_PORCENTAJE');

-- AlterTable
ALTER TABLE "class_schedules" ADD COLUMN     "instructorId" TEXT;

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "instructorId" TEXT;

-- CreateTable
CREATE TABLE "instructors" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT,
    "celular" TEXT,
    "email" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0ea5e9',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "sueldo" DECIMAL(12,2),
    "variable" "InstructorVariable",
    "valor" DECIMAL(12,2),
    "minimoPorClase" DECIMAL(12,2),
    "alumnosMinimos" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_disciplines" (
    "instructorId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "valor" DECIMAL(12,2),

    CONSTRAINT "instructor_disciplines_pkey" PRIMARY KEY ("instructorId","disciplineId")
);

-- CreateIndex
CREATE INDEX "instructors_clientId_deletedAt_idx" ON "instructors"("clientId", "deletedAt");

-- CreateIndex
CREATE INDEX "instructor_disciplines_disciplineId_idx" ON "instructor_disciplines"("disciplineId");

-- CreateIndex
CREATE INDEX "class_schedules_instructorId_idx" ON "class_schedules"("instructorId");

-- CreateIndex
CREATE INDEX "class_sessions_instructorId_idx" ON "class_sessions"("instructorId");

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_disciplines" ADD CONSTRAINT "instructor_disciplines_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_disciplines" ADD CONSTRAINT "instructor_disciplines_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE CASCADE ON UPDATE CASCADE;


