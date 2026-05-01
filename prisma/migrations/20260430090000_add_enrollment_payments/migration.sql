CREATE TYPE "EnrollmentPaymentStatus" AS ENUM ('PENDIENTE', 'PAGADO', 'VENCIDO');

CREATE TABLE "enrollment_payments" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "estado" "EnrollmentPaymentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3),
    "metodoPago" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "enrollment_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reminders" ADD COLUMN "enrollmentPaymentId" TEXT;

CREATE UNIQUE INDEX "enrollment_payments_estudianteId_key" ON "enrollment_payments"("estudianteId");
CREATE INDEX "enrollment_payments_clientId_idx" ON "enrollment_payments"("clientId");
CREATE INDEX "enrollment_payments_estudianteId_idx" ON "enrollment_payments"("estudianteId");
CREATE INDEX "enrollment_payments_clientId_estado_idx" ON "enrollment_payments"("clientId", "estado");
CREATE INDEX "enrollment_payments_clientId_fechaVencimiento_idx" ON "enrollment_payments"("clientId", "fechaVencimiento");
CREATE INDEX "reminders_enrollmentPaymentId_idx" ON "reminders"("enrollmentPaymentId");

ALTER TABLE "enrollment_payments" ADD CONSTRAINT "enrollment_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enrollment_payments" ADD CONSTRAINT "enrollment_payments_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_enrollmentPaymentId_fkey" FOREIGN KEY ("enrollmentPaymentId") REFERENCES "enrollment_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
