-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "MonthlyPaymentStatus" AS ENUM ('PENDIENTE', 'PAGADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "SuppliesPaymentStatus" AS ENUM ('PENDIENTE', 'PAGADO');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDIENTE', 'ENVIADA', 'FALLIDA', 'LEIDA');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "telefono" TEXT,
    "businessName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precioMensualidadDefault" DECIMAL(12,2) NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "edad" INTEGER NOT NULL,
    "celular" TEXT,
    "esMenorDeEdad" BOOLEAN NOT NULL DEFAULT false,
    "nombrePadre" TEXT,
    "telefonoPadre" TEXT,
    "parentesco" TEXT,
    "grupoId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "estado" "StudentStatus" NOT NULL DEFAULT 'ACTIVO',
    "precioMensualidad" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_payments" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3),
    "estado" "MonthlyPaymentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "metodoPago" TEXT,
    "comprobanteUrl" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "monthly_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplies_payments" (
    "id" TEXT NOT NULL,
    "nombreConcepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "grupoId" TEXT,
    "estudianteId" TEXT,
    "clientId" TEXT NOT NULL,
    "estado" "SuppliesPaymentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "supplies_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "categoria" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "deviceName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDIENTE',
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "monthlyPaymentId" TEXT,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "whatsappUrl" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDIENTE',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_email_key" ON "clients"("email");

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients"("email");

-- CreateIndex
CREATE INDEX "groups_clientId_idx" ON "groups"("clientId");

-- CreateIndex
CREATE INDEX "groups_clientId_nombre_idx" ON "groups"("clientId", "nombre");

-- CreateIndex
CREATE INDEX "students_clientId_idx" ON "students"("clientId");

-- CreateIndex
CREATE INDEX "students_grupoId_idx" ON "students"("grupoId");

-- CreateIndex
CREATE INDEX "students_clientId_estado_idx" ON "students"("clientId", "estado");

-- CreateIndex
CREATE INDEX "students_clientId_nombre_apellido_idx" ON "students"("clientId", "nombre", "apellido");

-- CreateIndex
CREATE INDEX "monthly_payments_clientId_idx" ON "monthly_payments"("clientId");

-- CreateIndex
CREATE INDEX "monthly_payments_grupoId_idx" ON "monthly_payments"("grupoId");

-- CreateIndex
CREATE INDEX "monthly_payments_estudianteId_idx" ON "monthly_payments"("estudianteId");

-- CreateIndex
CREATE INDEX "monthly_payments_clientId_estado_idx" ON "monthly_payments"("clientId", "estado");

-- CreateIndex
CREATE INDEX "monthly_payments_clientId_fechaVencimiento_idx" ON "monthly_payments"("clientId", "fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_payments_estudianteId_mes_anio_key" ON "monthly_payments"("estudianteId", "mes", "anio");

-- CreateIndex
CREATE INDEX "supplies_payments_clientId_idx" ON "supplies_payments"("clientId");

-- CreateIndex
CREATE INDEX "supplies_payments_grupoId_idx" ON "supplies_payments"("grupoId");

-- CreateIndex
CREATE INDEX "supplies_payments_estudianteId_idx" ON "supplies_payments"("estudianteId");

-- CreateIndex
CREATE INDEX "supplies_payments_clientId_estado_idx" ON "supplies_payments"("clientId", "estado");

-- CreateIndex
CREATE INDEX "supplies_payments_clientId_fechaVencimiento_idx" ON "supplies_payments"("clientId", "fechaVencimiento");

-- CreateIndex
CREATE INDEX "expenses_clientId_idx" ON "expenses"("clientId");

-- CreateIndex
CREATE INDEX "expenses_clientId_fecha_idx" ON "expenses"("clientId", "fecha");

-- CreateIndex
CREATE INDEX "expenses_clientId_categoria_idx" ON "expenses"("clientId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_clientId_idx" ON "push_tokens"("clientId");

-- CreateIndex
CREATE INDEX "notifications_clientId_idx" ON "notifications"("clientId");

-- CreateIndex
CREATE INDEX "notifications_clientId_status_idx" ON "notifications"("clientId", "status");

-- CreateIndex
CREATE INDEX "reminders_clientId_idx" ON "reminders"("clientId");

-- CreateIndex
CREATE INDEX "reminders_estudianteId_idx" ON "reminders"("estudianteId");

-- CreateIndex
CREATE INDEX "reminders_monthlyPaymentId_idx" ON "reminders"("monthlyPaymentId");

-- CreateIndex
CREATE INDEX "reminders_clientId_status_idx" ON "reminders"("clientId", "status");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_payments" ADD CONSTRAINT "monthly_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_payments" ADD CONSTRAINT "monthly_payments_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_payments" ADD CONSTRAINT "monthly_payments_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies_payments" ADD CONSTRAINT "supplies_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies_payments" ADD CONSTRAINT "supplies_payments_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies_payments" ADD CONSTRAINT "supplies_payments_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_monthlyPaymentId_fkey" FOREIGN KEY ("monthlyPaymentId") REFERENCES "monthly_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
