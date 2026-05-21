ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "paymentMethodItems" JSONB;

UPDATE "clients"
SET "paymentMethodItems" = jsonb_build_array(
  jsonb_build_object('name', 'Metodos de pago', 'account', "paymentMethods")
)
WHERE "paymentMethodItems" IS NULL
  AND "paymentMethods" IS NOT NULL
  AND btrim("paymentMethods") <> '';
