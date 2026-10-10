/**
 * Prepara la cuenta de Cloudinary (la misma de Nubi) para Duali (spec 010).
 *
 *   npx tsx --env-file=.env scripts/cloudinary-setup.ts
 *
 * Idempotente: verifica las credenciales y crea `duali/` y `duali/negocios/`.
 * Las carpetas de cada negocio (`duali/negocios/{id}/imagenes|videos/...`) las
 * crea la app la primera vez que ese negocio sube algo.
 */
import { v2 as cloudinary } from "cloudinary";
import { DUALI_ROOT_FOLDER, BUSINESSES_FOLDER } from "../src/lib/media-folders";

async function main() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET");
  }
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });

  const ping = await cloudinary.api.ping();
  console.log(`Credenciales OK (${ping.status})`);

  for (const folder of [DUALI_ROOT_FOLDER, BUSINESSES_FOLDER]) {
    await cloudinary.api.create_folder(folder);
    console.log(`Carpeta lista: ${folder}/`);
  }

  const { folders } = await cloudinary.api.sub_folders(DUALI_ROOT_FOLDER);
  console.log(`Dentro de ${DUALI_ROOT_FOLDER}/: ${folders.map((item: { name: string }) => item.name).join(", ") || "(vacío)"}`);
}

main().catch((error) => {
  console.error(error?.error?.message ?? error?.message ?? error);
  process.exitCode = 1;
});
