-- Spec 019 (asistencia). Solo aditivo: columnas con default o nulas.
-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "devolverClaseInasistencia" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "asistenciaAt" TIMESTAMP(3),
ADD COLUMN     "sinReserva" BOOLEAN NOT NULL DEFAULT false;
