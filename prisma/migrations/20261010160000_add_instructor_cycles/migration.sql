-- Spec 023 fase 2 (ciclos de pago de instructores y su calculo). Solo aditivo: tablas y tipos nuevos.
-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "InstructorCycleType" AS ENUM ('COMISION', 'SUELDO');

-- CreateEnum
CREATE TYPE "InstructorCycleStatus" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "InstructorCycleSettlement" AS ENUM ('SIN_PAGAR', 'PARCIAL', 'PAGADO');

-- CreateEnum
CREATE TYPE "InstructorPercentBase" AS ENUM ('VENDIDO', 'COBRADO');

-- CreateTable
CREATE TABLE "instructor_payment_settings" (
    "clientId" TEXT NOT NULL,
    "frecuencia" "PayFrequency" NOT NULL DEFAULT 'SEMANAL',
    "diaPago" INTEGER NOT NULL DEFAULT 7,
    "frecuenciaSueldo" "PayFrequency" NOT NULL DEFAULT 'MENSUAL',
    "diaPagoSueldo" INTEGER NOT NULL DEFAULT 15,
    "diaPagoAbreSiguiente" BOOLEAN NOT NULL DEFAULT false,
    "inasistenciasCuentan" BOOLEAN NOT NULL DEFAULT false,
    "pagarClasesVacias" BOOLEAN NOT NULL DEFAULT false,
    "basePorcentaje" "InstructorPercentBase" NOT NULL DEFAULT 'VENDIDO',
    "activadoEl" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructor_payment_settings_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "instructor_cycles" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "tipo" "InstructorCycleType" NOT NULL,
    "inicio" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "venceEl" DATE NOT NULL,
    "estado" "InstructorCycleStatus" NOT NULL DEFAULT 'ABIERTO',
    "situacion" "InstructorCycleSettlement" NOT NULL DEFAULT 'SIN_PAGAR',
    "sueldoSnapshot" DECIMAL(12,2),
    "variableSnapshot" "InstructorVariable",
    "valorSnapshot" DECIMAL(12,2),
    "minimoSnapshot" DECIMAL(12,2),
    "alumnosMinimosSnapshot" INTEGER NOT NULL DEFAULT 1,
    "valoresDisciplinaSnapshot" JSONB,
    "clases" INTEGER NOT NULL DEFAULT 0,
    "alumnos" INTEGER NOT NULL DEFAULT 0,
    "sinMarcar" INTEGER NOT NULL DEFAULT 0,
    "generado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cobradoDespues" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sueldo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ajustes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adelantos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "neto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pagado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pendiente" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "calculadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructor_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_cycle_classes" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "sessionId" TEXT,
    "horaInicio" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "disciplina" TEXT NOT NULL,
    "alumnos" INTEGER NOT NULL,
    "inasistencias" INTEGER NOT NULL DEFAULT 0,
    "sinMarcar" INTEGER NOT NULL DEFAULT 0,
    "valorClases" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "variableAplicada" "InstructorVariable" NOT NULL,
    "valorAplicado" DECIMAL(12,2) NOT NULL,
    "regla" TEXT NOT NULL,
    "ganado" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "instructor_cycle_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_cycle_collections" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "acreditado" DECIMAL(12,2) NOT NULL,
    "tardio" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "instructor_cycle_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_cycles_clientId_tipo_fin_idx" ON "instructor_cycles"("clientId", "tipo", "fin");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_cycles_instructorId_tipo_inicio_fin_key" ON "instructor_cycles"("instructorId", "tipo", "inicio", "fin");

-- CreateIndex
CREATE INDEX "instructor_cycle_classes_cycleId_idx" ON "instructor_cycle_classes"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_cycle_classes_scheduleId_fecha_key" ON "instructor_cycle_classes"("scheduleId", "fecha");

-- CreateIndex
CREATE INDEX "instructor_cycle_collections_bookingId_idx" ON "instructor_cycle_collections"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_cycle_collections_bookingId_cycleId_key" ON "instructor_cycle_collections"("bookingId", "cycleId");

-- AddForeignKey
ALTER TABLE "instructor_payment_settings" ADD CONSTRAINT "instructor_payment_settings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_cycles" ADD CONSTRAINT "instructor_cycles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_cycles" ADD CONSTRAINT "instructor_cycles_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_cycle_classes" ADD CONSTRAINT "instructor_cycle_classes_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "instructor_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_cycle_collections" ADD CONSTRAINT "instructor_cycle_collections_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "instructor_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


