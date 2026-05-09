ALTER TABLE "students"
ADD COLUMN "fechaInicioClases" TIMESTAMP(3);

CREATE INDEX "students_clientId_fechaInicioClases_idx"
ON "students"("clientId", "fechaInicioClases");
