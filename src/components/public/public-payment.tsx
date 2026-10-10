"use client";

import { useEffect, useRef, useState } from "react";
import { FiCheck, FiCopy, FiImage, FiUploadCloud } from "react-icons/fi";
import { focusRing } from "@/components/public/public-shell";
import { type OnlinePayment, RECEIPT_MIME_TYPES, receiptDataUrlProblem } from "@/lib/online-payments";
import { formatCop } from "@/lib/public-presentation";
import { cn } from "@/lib/web-utils";

export type PaymentMethod = { name: string; account: string };

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_SIDE = 1600;

/**
 * Spec 021 R2: la foto se reduce en el navegador (JPEG, 1600 px) antes de
 * enviarla, para que una foto de celular de 8 MB viaje en unos cientos de KB.
 */
export async function prepareReceiptImage(file: File): Promise<string> {
  if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase())) {
    throw new Error("Solo se aceptan fotos JPG, PNG o WebP. Si es una foto HEIC, toma una captura de pantalla.");
  }
  if (file.size > MAX_SOURCE_BYTES) throw new Error("La foto pesa demasiado. Toma una captura de pantalla del comprobante.");

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("No pudimos leer la imagen. Intenta con otra."));
      element.src = url;
    });
    for (const [side, quality] of [
      [MAX_SIDE, 0.85],
      [1200, 0.7]
    ] as const) {
      const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) break;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (!receiptDataUrlProblem(dataUrl)) return dataUrl;
    }
    throw new Error("No pudimos preparar la foto. Toma una captura de pantalla del comprobante.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Paso Pago (spec 021 R2, como CliqCut): las cuentas del estudio con Copiar, el
 * comprobante y, si el estudio lo permite, pagar en el estudio. Avisa con
 * `onChange(null)` mientras falte algo.
 */
export function PaymentStep({
  total,
  methods,
  allowInStudio,
  onChange
}: {
  total: number;
  methods: PaymentMethod[];
  allowInStudio: boolean;
  onChange: (payment: OnlinePayment | null) => void;
}) {
  const [method, setMethod] = useState<string | null>(methods[0]?.name ?? null);
  const [inStudio, setInStudio] = useState(!methods.length && allowInStudio);
  const [photo, setPhoto] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // La ref evita volver a avisar en cada render del padre (onChange suele venir en linea).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (inStudio) onChangeRef.current({ tipo: "EN_ESTUDIO" });
    else if (method && photo) onChangeRef.current({ tipo: "COMPROBANTE", comprobante: photo, metodo: method });
    else onChangeRef.current(null);
  }, [inStudio, method, photo]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      setPhoto(await prepareReceiptImage(file));
    } catch (pickError) {
      setPhoto(null);
      setError((pickError as Error).message);
    } finally {
      setPreparing(false);
      if (input.current) input.current.value = "";
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied((current) => (current === value ? null : current)), 2000);
    } catch {
      // El numero sigue visible para copiarlo a mano.
    }
  }

  if (!methods.length && !allowInStudio) {
    return (
      <p className="rounded-3xl bg-white p-5 text-sm text-ink-600 ring-1 ring-black/[0.06]">
        Este estudio aún no recibe pagos en línea. Escríbele para comprar tu plan.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between rounded-3xl bg-ink-950 px-5 py-4 text-white">
        <span className="text-sm text-white/70">Total a pagar</span>
        <span className="font-display text-3xl">{formatCop(total)}</span>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-ink-600">¿Cómo vas a pagar?</legend>
        {methods.map((item) => {
          const selected = !inStudio && method === item.name;
          return (
            <div
              key={item.name}
              className={cn(
                "flex items-center gap-3 rounded-3xl border-2 bg-white p-4 transition",
                selected ? "border-ink-950" : "border-transparent ring-1 ring-black/[0.06]"
              )}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="metodo-pago"
                  className="size-5 accent-ink-950"
                  checked={selected}
                  onChange={() => {
                    setInStudio(false);
                    setMethod(item.name);
                  }}
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{item.name}</span>
                  {item.account ? <span className="block truncate font-mono text-sm text-ink-600">{item.account}</span> : null}
                </span>
              </label>
              {item.account ? (
                <button
                  type="button"
                  onClick={() => copy(item.account)}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3 text-sm font-medium ${focusRing}`}
                >
                  {copied === item.account ? <FiCheck className="size-4" /> : <FiCopy className="size-4" />}
                  {copied === item.account ? "Copiado" : "Copiar"}
                </button>
              ) : null}
            </div>
          );
        })}
        {allowInStudio ? (
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-3xl border-2 bg-white p-4 transition",
              inStudio ? "border-ink-950" : "border-transparent ring-1 ring-black/[0.06]"
            )}
          >
            <input type="radio" name="metodo-pago" className="size-5 accent-ink-950" checked={inStudio} onChange={() => setInStudio(true)} />
            <span>
              <span className="block font-semibold">Pagar en el estudio</span>
              <span className="block text-sm text-ink-500">Pagas al llegar; tu plan queda por pagar.</span>
            </span>
          </label>
        ) : null}
      </fieldset>

      {!inStudio ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-600">Comprobante de pago</p>
          <input
            ref={input}
            type="file"
            accept={RECEIPT_MIME_TYPES.join(",")}
            className="sr-only"
            id="comprobante"
            onChange={(event) => pick(event.target.files?.[0])}
          />
          {photo ? (
            <div className="flex items-center gap-4 rounded-3xl bg-white p-3 ring-1 ring-black/[0.06]">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local */}
              <img src={photo} alt="Vista previa del comprobante" className="size-20 shrink-0 rounded-2xl object-cover" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                  <FiCheck className="size-4" />
                  Comprobante listo
                </span>
                <span className="block text-xs text-ink-500">Se envía al confirmar.</span>
              </span>
              <label htmlFor="comprobante" className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-sm font-medium underline underline-offset-4 ${focusRing}`}>
                Cambiar
              </label>
            </div>
          ) : (
            <label
              htmlFor="comprobante"
              className={cn(
                "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-black/15 bg-white/60 p-5 text-center transition hover:border-black/30",
                preparing && "cursor-wait opacity-70",
                focusRing
              )}
            >
              {preparing ? <FiImage className="size-6 animate-pulse text-ink-400" /> : <FiUploadCloud className="size-6 text-ink-400" />}
              <span className="text-sm font-semibold">{preparing ? "Preparando la foto…" : "Sube la foto o captura del pago"}</span>
              <span className="text-xs text-ink-500">JPG, PNG o WebP</span>
            </label>
          )}
          {error ? (
            <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
