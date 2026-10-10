"use client";

import { useState } from "react";
import { FiCheck, FiCopy, FiExternalLink, FiGlobe, FiMessageCircle } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { MediaUploader, draftFromSaved, isPending, useMediaSave, type MediaDraft } from "@/components/dashboard/media-uploader";
import { ToggleRow, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import { slugProblem } from "@/lib/studio-constants";

type State = {
  slug: string | null;
  sugerido: string | null;
  paginaPublicaActiva: boolean;
  businessName: string;
  portadaUrl: string | null;
  portadaPublicId: string | null;
};

/** Spec 008 R3: direccion, publicacion y compartir la pagina del estudio. */
export function PublicPagePanel({ state, baseUrl }: { state: State; baseUrl: string }) {
  const request = useStudioRequest();
  const [slug, setSlug] = useState(state.slug ?? state.sugerido ?? "");
  const [saving, setSaving] = useState<"slug" | "publish" | null>(null);
  const [copied, setCopied] = useState(false);

  const normalized = slug.trim().toLowerCase();
  const problem = normalized ? slugProblem(normalized) : "Escribe una dirección";
  const savedUrl = state.slug ? `${baseUrl}/s/${state.slug}` : null;
  const published = state.paginaPublicaActiva && Boolean(state.slug);

  async function save(body: Record<string, unknown>, kind: "slug" | "publish", title: string) {
    setSaving(kind);
    await request("/api/client/public-page", { method: "PUT", body: JSON.stringify(body) }, title);
    setSaving(null);
  }

  async function copy() {
    if (!savedUrl) return;
    try {
      await navigator.clipboard.writeText(savedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // El navegador puede negar el portapapeles; el enlace sigue visible para copiarlo a mano.
    }
  }

  const share = savedUrl
    ? `https://wa.me/?text=${encodeURIComponent(`Mira los planes y el horario de ${state.businessName} y aparta tu cupo aquí: ${savedUrl}`)}`
    : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Página pública</h1>
        <p className="mt-1 text-sm text-ink-500">Tus planes, horario y reservas en línea, en un solo enlace</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:space-y-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <FiGlobe className="size-4 shrink-0 text-brand-500" />
            <div>
              <h2 className="font-semibold text-ink-800">Estado</h2>
              <p className="mt-0.5 text-xs text-ink-400">
                {published ? "Cualquiera con el enlace puede ver tu página y reservar" : "Nadie puede verla todavía"}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              published ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500"
            }`}
          >
            {published ? "Publicada" : "Sin publicar"}
          </span>
        </div>

        <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
          <ToggleRow
            label="Publicar mi página"
            checked={state.paginaPublicaActiva}
            onChange={(value) =>
              save(
                { paginaPublicaActiva: value, ...(state.slug ? {} : { slug: normalized }) },
                "publish",
                value ? "Página publicada" : "Página despublicada"
              )
            }
          />
          {saving === "publish" ? <p className="mt-1 text-[11px] text-ink-400">Guardando…</p> : null}
        </div>

        {savedUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-700">{savedUrl}</span>
              <button
                type="button"
                onClick={copy}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
              >
                {copied ? <FiCheck className="size-3.5" /> : <FiCopy className="size-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={savedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
              >
                <FiExternalLink className="size-4" />
                {published ? "Abrir mi página" : "Ver cómo se verá"}
              </a>
              {published && share ? (
                <a
                  href={share}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <FiMessageCircle className="size-4" />
                  Compartir por WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:space-y-5 sm:p-6">
        <div>
          <h2 className="font-semibold text-ink-800">Dirección</h2>
          <p className="mt-0.5 text-xs text-ink-400">Corta y fácil de recordar. Si la cambias, el enlace anterior deja de funcionar.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="public-slug">
            {baseUrl.replace(/^https?:\/\//, "")}/s/
          </label>
          <input
            id="public-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))}
            placeholder="mi-estudio"
            className={inputClass}
          />
          {normalized && problem ? <p className="mt-1 text-xs font-medium text-rose-600">{problem}</p> : null}
        </div>
        <div className="flex justify-end">
          <Button
            className="w-full rounded-xl px-4 py-2 font-medium shadow-none sm:w-auto"
            disabled={Boolean(problem) || normalized === state.slug}
            loading={saving === "slug"}
            onClick={() => save({ slug: normalized }, "slug", "Dirección guardada")}
          >
            Guardar dirección
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:space-y-5 sm:p-6">
        <div>
          <h2 className="font-semibold text-ink-800">Portada</h2>
          <p className="mt-0.5 text-xs text-ink-400">La imagen grande de arriba de tu página. Mejor horizontal.</p>
        </div>
        <CoverEditor key={state.portadaPublicId ?? "sin-portada"} saved={draftFromSaved(state.portadaUrl, state.portadaPublicId)} />
      </section>

      <p className="text-xs text-ink-400">
        En tu página se ven las disciplinas activas, los paquetes marcados como visibles, el horario de los próximos días con los
        cupos libres y tus métodos de pago. Nunca se muestran los nombres de tus clientes.
      </p>
    </div>
  );
}

/** Portada (spec 010): como en Nubi, se elige, se ve y se sube solo al guardar. */
function CoverEditor({ saved }: { saved: MediaDraft }) {
  const request = useStudioRequest();
  const { progress, saveWithMedia } = useMediaSave();
  const [draft, setDraft] = useState<MediaDraft>(saved);
  const [saving, setSaving] = useState(false);
  const savedId = saved && "saved" in saved ? saved.saved.publicId : null;
  const draftId = draft && "saved" in draft ? draft.saved.publicId : null;
  const changed = isPending(draft) || draftId !== savedId;

  async function submit() {
    setSaving(true);
    await saveWithMedia(draft, { kind: "IMAGEN", use: "portada" }, (portada) =>
      request("/api/client/public-page", { method: "PUT", body: JSON.stringify({ portada }) }, portada ? "Portada guardada" : "Portada quitada")
    );
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <MediaUploader kind="IMAGEN" aspect="aspect-[3/1]" value={draft} onChange={setDraft} progress={progress} />
      {changed ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="rounded-xl px-4 py-2 font-medium" disabled={saving} onClick={() => setDraft(saved)}>
            Descartar
          </Button>
          <Button type="button" className="rounded-xl px-4 py-2 font-medium shadow-none" loading={saving} onClick={submit}>
            Guardar portada
          </Button>
        </div>
      ) : null}
    </div>
  );
}
