-- Spec 023 fase 3 (pagos a instructores: metodos y aplicaciones por ciclo). Solo aditivo: tablas nuevas.
-- CreateTable
CREATE TABLE "instructor_payments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "tipo" "InstructorCycleType" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "nota" TEXT,
    "expenseId" TEXT,
    "anuladoAt" TIMESTAMP(3),
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_payment_methods" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "instructor_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_payment_applications" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "instructor_payment_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_payments_clientId_fecha_idx" ON "instructor_payments"("clientId", "fecha");

-- CreateIndex
CREATE INDEX "instructor_payments_instructorId_idx" ON "instructor_payments"("instructorId");

-- CreateIndex
CREATE INDEX "instructor_payment_methods_paymentId_idx" ON "instructor_payment_methods"("paymentId");

-- CreateIndex
CREATE INDEX "instructor_payment_applications_paymentId_idx" ON "instructor_payment_applications"("paymentId");

-- CreateIndex
CREATE INDEX "instructor_payment_applications_cycleId_idx" ON "instructor_payment_applications"("cycleId");

-- AddForeignKey
ALTER TABLE "instructor_payments" ADD CONSTRAINT "instructor_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_payments" ADD CONSTRAINT "instructor_payments_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_payment_methods" ADD CONSTRAINT "instructor_payment_methods_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "instructor_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_payment_applications" ADD CONSTRAINT "instructor_payment_applications_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "instructor_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_payment_applications" ADD CONSTRAINT "instructor_payment_applications_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "instructor_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


