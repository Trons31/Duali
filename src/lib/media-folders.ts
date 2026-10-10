// Orden de carpetas en Cloudinary (spec 010), al estilo de Nubi:
//
//   duali/negocios/{clientId}/imagenes/{uso}
//   duali/negocios/{clientId}/videos/{uso}
//
// Se usa el id del negocio (no el slug) porque el slug puede cambiar.

export const DUALI_ROOT_FOLDER = "duali";
export const BUSINESSES_FOLDER = `${DUALI_ROOT_FOLDER}/negocios`;

export const MEDIA_KINDS = { IMAGEN: "imagenes", VIDEO: "videos" } as const;
export type MediaKind = keyof typeof MEDIA_KINDS;

export const MEDIA_USES = ["publicaciones", "disciplinas", "portada", "comprobantes"] as const;
export type MediaUse = (typeof MEDIA_USES)[number];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function businessFolder(clientId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(clientId)) throw new Error("Id de negocio inválido para una carpeta");
  return `${BUSINESSES_FOLDER}/${clientId}`;
}

export function mediaFolder(clientId: string, kind: MediaKind, use: MediaUse) {
  return `${businessFolder(clientId)}/${MEDIA_KINDS[kind]}/${use}`;
}

/** Un archivo subido pertenece a ese negocio solo si su public_id vive en su carpeta. */
export function belongsToBusiness(publicId: string, clientId: string, kind?: MediaKind) {
  const base = businessFolder(clientId);
  const prefix = kind ? `${base}/${MEDIA_KINDS[kind]}/` : `${base}/`;
  return publicId.startsWith(prefix) && !publicId.includes("..");
}

/** public_id de una URL de Cloudinary (misma regla que Nubi). */
export function extractCloudinaryPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(duali\/.+?)(?:\.[a-zA-Z0-9]+)?$/);
  return match ? match[1] : null;
}

export function resourceTypeFor(kind: MediaKind) {
  return kind === "VIDEO" ? "video" : "image";
}
