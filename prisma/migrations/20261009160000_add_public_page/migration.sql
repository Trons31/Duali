-- Specs 008 y 009 (pagina publica y reserva web). Solo aditivo: columnas NULL o con DEFAULT e indices unicos.
-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "paginaPublicaActiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "accessToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clients_slug_key" ON "clients"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_accessToken_key" ON "bookings"("accessToken");

