"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { FiTrash2, FiUploadCloud } from "react-icons/fi";
import { clientApiFetch } from "@/lib/client-api";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, type MediaKind, type MediaUse } from "@/lib/media-folders";
import { cn } from "@/lib/web-utils";

// Archivos del estudio (spec 010, revision): como en Nubi, elegir un archivo
// solo muestra la vista previa; se sube a Cloudinary al guardar el formulario.

export type SavedMedia = { url: string; publicId: string };
/** Lo que el formulario tiene en mano: lo ya guardado, un archivo por subir o nada. */
export type MediaDraft = { saved: SavedMedia } | { file: File; previewUrl: string } | null;

export const draftFromSaved = (url: string | null | undefined, publicId: string | null | undefined): MediaDraft =>
  url && publicId ? { saved: { url, publicId } } : null;

export const isPending = (draft: MediaDraft): draft is { file: File; previewUrl: string } => Boolean(draft && "file" in draft);

export type Signature = {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string;
  transformation: string | null;
  maxBytes: number;
};

const ACCEPT: Record<MediaKind, string> = {
  IMAGEN: "image/jpeg,image/png,image/webp,image/heic",
  VIDEO: "video/mp4,video/quicktime,video/webm"
};

export function uploadWithProgress(signed: Signature, file: File, onProgress?: (percent: number) => void) {
  return new Promise<SavedMedia>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signed.apiKey);
    form.append("timestamp", String(signed.timestamp));
    form.append("signature", signed.signature);
    form.append("folder", signed.folder);
    form.append("allowed_formats", signed.allowedFormats);
    if (signed.transformation) form.append("transformation", signed.transformation);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", signed.uploadUrl);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve({ url: body.secure_url, publicId: body.public_id });
      else reject(new Error(body?.error?.message ?? "No se pudo subir el archivo"));
    };
    xhr.onerror = () => reject(new Error("Sin conexión al subir el archivo"));
    xhr.send(form);
  });
}

/**
 * Se llama al guardar: sube el archivo pendiente (si hay) y devuelve lo que se
 * debe enviar a la API. `null` = sin archivo; `uploaded` indica si se subio uno
 * nuevo en este guardado (para descartarlo si el guardado falla).
 */
export async function resolveMediaDraft(
  draft: MediaDraft,
  options: { token: string; kind: MediaKind; use: MediaUse; onProgress?: (percent: number) => void }
): Promise<{ media: SavedMedia | null; uploaded: SavedMedia | null }> {
  if (!draft) return { media: null, uploaded: null };
  if ("saved" in draft) return { media: draft.saved, uploaded: null };

  const signed = await clientApiFetch<Signature>("/api/media/signature", options.token, {
    method: "POST",
    body: JSON.stringify({ kind: options.kind, use: options.use })
  });
  const uploaded = await uploadWithProgress(signed, draft.file, options.onProgress);
  return { media: uploaded, uploaded };
}

/** Si el guardado fallo despues de subir, se borra lo recien subido (el servidor verifica que no se use). */
export async function discardUploaded(token: string, uploaded: SavedMedia | null, kind: MediaKind) {
  if (!uploaded) return;
  await clientApiFetch("/api/media", token, {
    method: "DELETE",
    body: JSON.stringify({ publicId: uploaded.publicId, kind })
  }).catch(() => undefined);
}

export function MediaUploader({
  kind,
  value,
  onChange,
  label,
  aspect = "aspect-video",
  progress = null
}: {
  kind: MediaKind;
  value: MediaDraft;
  onChange: (value: MediaDraft) => void;
  label?: string;
  aspect?: string;
  /** Progreso de la subida mientras se guarda (lo maneja el formulario). */
  progress?: number | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = value ? ("saved" in value ? value.saved.url : value.previewUrl) : null;
  const maxBytes = kind === "VIDEO" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  // Libera la vista previa local cuando cambia o se desmonta.
  useEffect(() => {
    if (!value || "saved" in value) return;
    const url = value.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function handleFile(file: File) {
    setError(null);
    if (file.size > maxBytes) {
      setError(`El archivo pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB`);
      return;
    }
    onChange({ file, previewUrl: URL.createObjectURL(file) });
  }

  return (
    <div>
      {label ? <span className="mb-1 block text-xs font-medium text-ink-500">{label}</span> : null}
      <div className={cn("relative overflow-hidden rounded-xl border border-dashed border-ink-200 bg-ink-50", aspect)}>
        {previewUrl ? (
          kind === "VIDEO" ? (
            <video src={previewUrl} controls className="h-full w-full bg-black object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-500 transition hover:text-brand-600"
          >
            <FiUploadCloud className="size-6" />
            <span className="text-xs font-medium">{kind === "VIDEO" ? "Elegir video (máx. 100 MB)" : "Elegir imagen (máx. 10 MB)"}</span>
          </button>
        )}

        {isPending(value) && progress === null ? (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-ink-600">
            Se sube al guardar
          </span>
        ) : null}

        {progress !== null ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90">
            <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium text-ink-600">Subiendo… {progress}%</span>
          </div>
        ) : null}
      </div>

      {value && progress === null ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
          >
            <FiTrash2 className="size-3.5" />
            Quitar
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
      <input
        ref={input}
        type="file"
        accept={ACCEPT[kind]}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * Ciclo completo al guardar un formulario con archivo: sube lo pendiente,
 * guarda con `submit` y, si el guardado falla, descarta lo recien subido.
 */
export function useMediaSave() {
  const { data: session } = useSession();
  const [progress, setProgress] = useState<number | null>(null);

  async function saveWithMedia(
    draft: MediaDraft,
    options: { kind: MediaKind; use: MediaUse },
    submit: (media: SavedMedia | null) => Promise<boolean>
  ) {
    const token = session?.user.apiToken;
    if (!token) return false;

    let resolved: Awaited<ReturnType<typeof resolveMediaDraft>>;
    try {
      if (isPending(draft)) setProgress(0);
      resolved = await resolveMediaDraft(draft, { token, ...options, onProgress: setProgress });
    } catch (error) {
      sileo.error({ title: (error as Error).message });
      return false;
    } finally {
      setProgress(null);
    }

    const saved = await submit(resolved.media);
    if (!saved) await discardUploaded(token, resolved.uploaded, options.kind);
    return saved;
  }

  return { progress, saveWithMedia };
}
