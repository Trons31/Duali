import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "@/lib/http";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MEDIA_KINDS,
  type MediaKind,
  type MediaUse,
  belongsToBusiness,
  businessFolder,
  mediaFolder,
  resourceTypeFor
} from "@/lib/media-folders";

// Cloudinary (misma cuenta de Nubi). Spec 010: subidas firmadas directo desde el
// navegador, siempre dentro de duali/negocios/{clientId}/imagenes|videos.

// Como Nubi (logoTransform/qrTransform): las imagenes se reducen al subirlas.
export const IMAGE_TRANSFORMATION = "c_limit,w_2000,h_2000,q_auto";

export const ALLOWED_FORMATS: Record<MediaKind, string[]> = {
  IMAGEN: ["jpg", "jpeg", "png", "webp", "heic"],
  VIDEO: ["mp4", "mov", "webm"]
};

function config() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new ApiError(503, "El almacenamiento de archivos no está configurado");
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
  return { cloudName: CLOUDINARY_CLOUD_NAME, apiKey: CLOUDINARY_API_KEY, apiSecret: CLOUDINARY_API_SECRET };
}

const syncedBusinesses = new Set<string>();

// Pruebas: con DUALI_MEDIA_OFFLINE=1 no se llama a la API de Cloudinary (crear
// carpetas, borrar); los borrados quedan anotados aqui para comprobarlos.
const isOffline = () => process.env.DUALI_MEDIA_OFFLINE === "1";
export const offlineDeletions: string[] = [];

/**
 * Deja creadas imagenes/ y videos/ del negocio, para que su carpeta se vea en
 * orden aunque todavia no haya subido nada de un tipo. Best-effort y una vez
 * por proceso: subir con `folder` tambien crea la carpeta si faltara.
 */
async function ensureBusinessFolders(clientId: string) {
  if (syncedBusinesses.has(clientId) || isOffline()) return;
  syncedBusinesses.add(clientId);
  try {
    for (const kind of Object.values(MEDIA_KINDS)) {
      await cloudinary.api.create_folder(`${businessFolder(clientId)}/${kind}`);
    }
  } catch (error) {
    syncedBusinesses.delete(clientId);
    console.error("No se pudieron crear las carpetas del negocio en Cloudinary", error);
  }
}

/** Spec 010 R1: firma una subida directa a la carpeta del negocio. */
export async function signUpload(clientId: string, kind: MediaKind, use: MediaUse, now = Date.now()) {
  const { cloudName, apiKey, apiSecret } = config();
  if (kind === "VIDEO" && use !== "publicaciones") throw new ApiError(422, "Los videos solo van en publicaciones");
  await ensureBusinessFolders(clientId);

  const folder = mediaFolder(clientId, kind, use);
  const timestamp = Math.floor(now / 1000);
  // Todo lo firmado lo hace cumplir Cloudinary: la carpeta y los formatos no se
  // pueden cambiar desde el navegador sin invalidar la firma.
  const params: Record<string, string | number> = {
    allowed_formats: ALLOWED_FORMATS[kind].join(","),
    folder,
    timestamp,
    ...(kind === "IMAGEN" ? { transformation: IMAGE_TRANSFORMATION } : {})
  };
  const signature = cloudinary.utils.api_sign_request(params, apiSecret);
  const resourceType = resourceTypeFor(kind);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    apiKey,
    timestamp,
    signature,
    folder,
    allowedFormats: String(params.allowed_formats),
    transformation: kind === "IMAGEN" ? IMAGE_TRANSFORMATION : null,
    maxBytes: kind === "VIDEO" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  };
}

export type MediaInput = { url: string; publicId: string };

/**
 * Spec 010: un archivo se acepta solo si esta en la carpeta de ese negocio y
 * la URL es de nuestra nube. Asi nadie guarda archivos de otro negocio.
 */
export function assertOwnedMedia(media: MediaInput, clientId: string, kind: MediaKind) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const resourceType = resourceTypeFor(kind);
  let url: URL;
  try {
    url = new URL(media.url);
  } catch {
    throw new ApiError(422, "Archivo inválido");
  }

  const validUrl =
    url.protocol === "https:" &&
    url.hostname === "res.cloudinary.com" &&
    url.pathname.startsWith(`/${cloudName}/${resourceType}/upload/`) &&
    url.pathname.includes(`/${media.publicId}`);

  if (!cloudName || !validUrl || !belongsToBusiness(media.publicId, clientId, kind)) {
    throw new ApiError(422, "Ese archivo no pertenece a tu negocio");
  }
}

/** Best-effort, como en Nubi: un fallo al borrar no revierte lo ya guardado. */
export async function deleteFromCloudinary(publicId: string | null | undefined, kind: MediaKind) {
  if (!publicId) return;
  if (isOffline()) {
    offlineDeletions.push(publicId);
    return;
  }
  try {
    config();
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceTypeFor(kind), invalidate: true });
  } catch (error) {
    console.error("No se pudo borrar de Cloudinary:", publicId, error);
  }
}
