ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "paymentMethods" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappMessageTemplate" TEXT;
