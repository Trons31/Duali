ALTER TYPE "MonthlyPaymentStatus" ADD VALUE IF NOT EXISTS 'ABONADO';
ALTER TYPE "EnrollmentPaymentStatus" ADD VALUE IF NOT EXISTS 'ABONADO';

ALTER TABLE "monthly_payments"
  ADD COLUMN "montoAbonado" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "saldoPendiente" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cantidadAbonos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ultimoMetodoAbono" TEXT,
  ADD COLUMN "fechaUltimoAbono" TIMESTAMP(3);

ALTER TABLE "enrollment_payments"
  ADD COLUMN "montoAbonado" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "saldoPendiente" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cantidadAbonos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ultimoMetodoAbono" TEXT,
  ADD COLUMN "fechaUltimoAbono" TIMESTAMP(3);

UPDATE "monthly_payments"
SET "saldoPendiente" = CASE
  WHEN "estado" = 'PAGADO' THEN 0
  ELSE "monto"
END;

UPDATE "enrollment_payments"
SET "saldoPendiente" = CASE
  WHEN "estado" = 'PAGADO' THEN 0
  ELSE "monto"
END;

CREATE TABLE "payment_installments" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "estudianteId" TEXT NOT NULL,
  "monthlyPaymentId" TEXT,
  "enrollmentPaymentId" TEXT,
  "numero" INTEGER NOT NULL,
  "concepto" TEXT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "metodoPago" TEXT NOT NULL,
  "fechaAbono" TIMESTAMP(3) NOT NULL,
  "saldoAnterior" DECIMAL(12,2) NOT NULL,
  "saldoRestante" DECIMAL(12,2) NOT NULL,
  "registradoPorUserId" TEXT,
  "registradoPorNombre" TEXT,
  "notas" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_installments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_installments_one_payment_chk" CHECK (
    ("monthlyPaymentId" IS NOT NULL AND "enrollmentPaymentId" IS NULL)
    OR ("monthlyPaymentId" IS NULL AND "enrollmentPaymentId" IS NOT NULL)
  )
);

CREATE INDEX "payment_installments_clientId_idx" ON "payment_installments"("clientId");
CREATE INDEX "payment_installments_estudianteId_idx" ON "payment_installments"("estudianteId");
CREATE INDEX "payment_installments_monthlyPaymentId_idx" ON "payment_installments"("monthlyPaymentId");
CREATE INDEX "payment_installments_enrollmentPaymentId_idx" ON "payment_installments"("enrollmentPaymentId");
CREATE INDEX "payment_installments_clientId_fechaAbono_idx" ON "payment_installments"("clientId", "fechaAbono");
CREATE UNIQUE INDEX "payment_installments_monthlyPaymentId_numero_key" ON "payment_installments"("monthlyPaymentId", "numero");
CREATE UNIQUE INDEX "payment_installments_enrollmentPaymentId_numero_key" ON "payment_installments"("enrollmentPaymentId", "numero");

ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_monthlyPaymentId_fkey" FOREIGN KEY ("monthlyPaymentId") REFERENCES "monthly_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_enrollmentPaymentId_fkey" FOREIGN KEY ("enrollmentPaymentId") REFERENCES "enrollment_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
