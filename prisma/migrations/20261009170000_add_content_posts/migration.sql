-- Spec 010 (contenido y portadas). Solo aditivo: enum, tabla nueva y columnas NULL.
-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('PUBLICACION', 'VIDEO');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "portadaPublicId" TEXT,
ADD COLUMN     "portadaUrl" TEXT;

-- AlterTable
ALTER TABLE "disciplines" ADD COLUMN     "imagenPublicId" TEXT,
ADD COLUMN     "imagenUrl" TEXT;

-- CreateTable
CREATE TABLE "content_posts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tipo" "ContentType" NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT,
    "disciplineId" TEXT,
    "mediaUrl" TEXT,
    "mediaPublicId" TEXT,
    "mediaKind" TEXT,
    "enlaceVideo" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "fijado" BOOLEAN NOT NULL DEFAULT false,
    "publicadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "content_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_posts_clientId_deletedAt_idx" ON "content_posts"("clientId", "deletedAt");

-- CreateIndex
CREATE INDEX "content_posts_clientId_publicado_idx" ON "content_posts"("clientId", "publicado");

-- AddForeignKey
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

