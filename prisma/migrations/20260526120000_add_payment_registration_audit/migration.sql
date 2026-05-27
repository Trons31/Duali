ALTER TABLE "monthly_payments"
  ADD COLUMN IF NOT EXISTS "fechaRegistro" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "registradoPorUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "registradoPorNombre" TEXT;

ALTER TABLE "enrollment_payments"
  ADD COLUMN IF NOT EXISTS "fechaRegistro" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "registradoPorUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "registradoPorNombre" TEXT;

UPDATE "monthly_payments"
SET "fechaRegistro" = COALESCE("fechaRegistro", "updatedAt")
WHERE "estado" = 'PAGADO' AND "fechaPago" IS NOT NULL;

UPDATE "enrollment_payments"
SET "fechaRegistro" = COALESCE("fechaRegistro", "updatedAt")
WHERE "estado" = 'PAGADO' AND "fechaPago" IS NOT NULL;
