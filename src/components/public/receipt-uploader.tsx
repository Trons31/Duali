"use client";

import { useEffect, useRef, useState } from "react";
import { FiCheck, FiImage, FiUploadCloud } from "react-icons/fi";
import { type Signature, uploadWithProgress } from "@/components/dashboard/media-uploader";
import { focusRing } from "@/components/public/public-shell";
import { MAX_IMAGE_BYTES } from "@/lib/media-folders";

/**
 * Comprobante de pago desde la reserva web (spec 014 R4). Como en Nubi: elegir
 * la foto solo muestra la vista previa; se sube al tocar "Enviar comprobante".
 */
export function ReceiptUploader({ token, onSent }: { token: string; onSent?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function pick(next: File) {
    setError(null);
    if (!next.type.startsWith("image/")) return setError("Elige una foto o captura del comprobante");
    if (next.size > MAX_IMAGE_BYTES) return setError("La foto pesa más de 10 MB");
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  async function send() {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const signResponse = await fetch(`/api/public/bookings/${token}/receipt-signature`, { method: "POST" });
      const signPayload = await signResponse.json().catch(() => null);
      if (!signResponse.ok) throw new Error(signPayload?.error ?? "No pudimos preparar el envío");

      const uploaded = await uploadWithProgress(signPayload.data as Signature, file, setProgress);
      const attachResponse = await fetch(`/api/public/bookings/${token}/receipts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(uploaded)
      });
      const attachPayload = await attachResponse.json().catch(() => null);
      if (!attachResponse.ok) throw new Error(attachPayload?.error ?? "No pudimos enviar el comprobante");

      setSent(true);
      onSent?.();
    } catch (sendError) {
      setError((sendError as Error).message);
    } finally {
      setProgress(null);
    }
  }

  if (sent) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        <FiCheck className="size-4" />
        Comprobante enviado. El estudio lo revisará pronto.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Vista previa del comprobante" className="max-h-72 w-full rounded-2xl object-contain ring-1 ring-black/[0.06]" />
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 bg-white text-sm text-ink-600 transition hover:border-black/30 ${focusRing}`}
        >
          <FiImage className="size-6" />
          Elegir foto o captura del comprobante
        </button>
      )}

      {error ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {file ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={progress !== null}
            onClick={() => input.current?.click()}
            className={`min-h-12 rounded-full border border-black/10 bg-white px-4 text-sm font-medium disabled:opacity-50 ${focusRing}`}
          >
            Cambiar
          </button>
          <button
            type="button"
            disabled={progress !== null}
            onClick={send}
            className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink-950 px-5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60 ${focusRing}`}
          >
            <FiUploadCloud className="size-4" />
            {progress !== null ? `Enviando… ${progress}%` : "Enviar comprobante"}
          </button>
        </div>
      ) : null}

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) pick(next);
          event.target.value = "";
        }}
      />
    </div>
  );
}
