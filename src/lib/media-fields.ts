import { assertOwnedMedia, type MediaInput } from "@/lib/cloudinary";
import type { MediaKind } from "@/lib/media-folders";

/**
 * Convierte `{ url, publicId } | null | undefined` del body en las columnas
 * `{prefix}Url` / `{prefix}PublicId`, validando que el archivo sea del negocio.
 * undefined = no tocar; null = quitar.
 */
export function mediaColumns<P extends string>(
  prefix: P,
  media: MediaInput | null | undefined,
  clientId: string,
  kind: MediaKind = "IMAGEN"
): Partial<Record<`${P}Url` | `${P}PublicId`, string | null>> {
  if (media === undefined) return {};
  if (media === null) return { [`${prefix}Url`]: null, [`${prefix}PublicId`]: null } as Record<`${P}Url` | `${P}PublicId`, null>;
  assertOwnedMedia(media, clientId, kind);
  return { [`${prefix}Url`]: media.url, [`${prefix}PublicId`]: media.publicId } as Record<`${P}Url` | `${P}PublicId`, string>;
}
