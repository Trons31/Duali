-- Spec 027 (pago en dos partes). Solo aditivo: una tabla nueva y una columna nullable en expenses.
-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "metodoPago" TEXT;

-- CreateTable
CREATE TABLE "payment_method_parts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "memberPackagePaymentId" TEXT,
    "paymentInstallmentId" TEXT,
    "monthlyPaymentId" TEXT,
    "enrollmentPaymentId" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_method_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_method_parts_clientId_idx" ON "payment_method_parts"("clientId");

-- CreateIndex
CREATE INDEX "payment_method_parts_memberPackagePaymentId_idx" ON "payment_method_parts"("memberPackagePaymentId");

-- CreateIndex
CREATE INDEX "payment_method_parts_paymentInstallmentId_idx" ON "payment_method_parts"("paymentInstallmentId");

-- CreateIndex
CREATE INDEX "payment_method_parts_monthlyPaymentId_idx" ON "payment_method_parts"("monthlyPaymentId");

-- CreateIndex
CREATE INDEX "payment_method_parts_enrollmentPaymentId_idx" ON "payment_method_parts"("enrollmentPaymentId");

-- CreateIndex
CREATE INDEX "payment_method_parts_expenseId_idx" ON "payment_method_parts"("expenseId");

-- AddForeignKey
ALTER TABLE "payment_method_parts" ADD CONSTRAINT "payment_method_parts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_parts" ADD CONSTRAINT "payment_method_parts_memberPackagePaymentId_fkey" FOREIGN KEY ("memberPackagePaymentId") REFERENCES "member_package_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_parts" ADD CONSTRAINT "payment_method_parts_paymentInstallmentId_fkey" FOREIGN KEY ("paymentInstallmentId") REFERENCES "payment_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_parts" ADD CONSTRAINT "payment_method_parts_monthlyPaymentId_fkey" FOREIGN KEY ("monthlyPaymentId") REFERENCES "monthly_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_parts" ADD CONSTRAINT "payment_method_parts_enrollmentPaymentId_fkey" FOREIGN KEY ("enrollmentPaymentId") REFERENCES "enrollment_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_parts" ADD CONSTRAINT "payment_method_parts_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

