/**
 * Verifica contra la cuenta real que la subida firmada de Duali funciona
 * (spec 010): firma con signUpload, sube como lo hace el navegador, comprueba
 * carpeta y formato, y limpia todo lo que creo.
 *
 *   npx tsx --env-file=.env scripts/cloudinary-verify.ts
 */
import { v2 as cloudinary } from "cloudinary";
import { signUpload } from "../src/lib/cloudinary";
import { businessFolder } from "../src/lib/media-folders";

const TEST_BUSINESS = "_verificacion";
// PNG de 1x1 pixel transparente.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

async function upload(signed: Awaited<ReturnType<typeof signUpload>>, file: Blob, name: string) {
  const form = new FormData();
  form.append("file", file, name);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("signature", signed.signature);
  form.append("folder", signed.folder);
  form.append("allowed_formats", signed.allowedFormats);
  if (signed.transformation) form.append("transformation", signed.transformation);
  const response = await fetch(signed.uploadUrl, { method: "POST", body: form });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function main() {
  const use = process.argv.includes("--comprobantes") ? "comprobantes" : "publicaciones";
  const signed = await signUpload(TEST_BUSINESS, "IMAGEN", use);
  const ok = await upload(signed, new Blob([PIXEL], { type: "image/png" }), "pixel.png");
  if (ok.status !== 200) throw new Error(`La subida firmada falló: ${ok.status} ${JSON.stringify(ok.body.error)}`);
  const publicId: string = ok.body.public_id;
  console.log(`1. Subida firmada OK → ${publicId}`);
  if (!publicId.startsWith(`${signed.folder}/`)) throw new Error("El archivo no quedó en la carpeta firmada");
  console.log("2. Quedó en la carpeta del negocio");

  // Cambiar la carpeta desde el navegador invalida la firma.
  const tampered = await upload({ ...signed, folder: "duali/negocios/otro-negocio/imagenes/publicaciones" }, new Blob([PIXEL], { type: "image/png" }), "pixel.png");
  console.log(`3. Carpeta alterada → ${tampered.status === 401 || tampered.status === 400 ? "rechazada" : `NO rechazada (${tampered.status})`}`);

  // Un formato no permitido lo rechaza Cloudinary.
  const wrongFormat = await upload(signed, new Blob(["hola"], { type: "text/plain" }), "nota.txt");
  console.log(`4. Formato no permitido → ${wrongFormat.status >= 400 ? "rechazado" : `NO rechazado (${wrongFormat.status})`}`);

  await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
  for (const folder of [signed.folder, `${businessFolder(TEST_BUSINESS)}/imagenes`, `${businessFolder(TEST_BUSINESS)}/videos`, businessFolder(TEST_BUSINESS)]) {
    await cloudinary.api.delete_folder(folder).catch(() => undefined);
  }
  console.log("5. Limpieza hecha (archivo y carpeta de verificación borrados)");

  if (tampered.status < 400 || wrongFormat.status < 400) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.error?.message ?? error?.message ?? error);
  process.exitCode = 1;
});
