CREATE TYPE "MonthlyBillingMode" AS ENUM ('ANTICIPADA', 'VENCIDA');

ALTER TABLE "students"
ADD COLUMN "modalidadMensualidad" "MonthlyBillingMode" NOT NULL DEFAULT 'ANTICIPADA';
