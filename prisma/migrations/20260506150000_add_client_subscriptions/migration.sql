-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVA', 'PENDIENTE', 'SUSPENDIDA', 'CANCELADA', 'VENCIDA');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "features" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_subscriptions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVA',
    "price" DECIMAL(12,2) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "nextBillingAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_slug_key" ON "plans"("slug");

-- CreateIndex
CREATE INDEX "plans_isActive_idx" ON "plans"("isActive");

-- CreateIndex
CREATE INDEX "client_subscriptions_clientId_idx" ON "client_subscriptions"("clientId");

-- CreateIndex
CREATE INDEX "client_subscriptions_planId_idx" ON "client_subscriptions"("planId");

-- CreateIndex
CREATE INDEX "client_subscriptions_status_nextBillingAt_idx" ON "client_subscriptions"("status", "nextBillingAt");

-- CreateIndex
CREATE INDEX "subscription_payments_subscriptionId_idx" ON "subscription_payments"("subscriptionId");

-- CreateIndex
CREATE INDEX "subscription_payments_clientId_idx" ON "subscription_payments"("clientId");

-- CreateIndex
CREATE INDEX "subscription_payments_clientId_paidAt_idx" ON "subscription_payments"("clientId", "paidAt");

-- AddForeignKey
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "client_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
