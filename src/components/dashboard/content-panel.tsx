"use client";

import { useState } from "react";
import { FiEdit2, FiExternalLink, FiFileText, FiImage, FiPlus, FiTrash2, FiVideo } from "react-icons/fi";
import { BsPinAngleFill } from "react-icons/bs";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { MediaUploader, draftFromSaved, useMediaSave, type MediaDraft } from "@/components/dashboard/media-uploader";
import { ColorDot, EmptyCard, ToggleRow, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import { formatDate, cn } from "@/lib/web-utils";
import type { ContentPostItem, DisciplineItem } from "@/lib/web-types";

type Mode = "FOTO" | "VIDEO_ARCHIVO" | "VIDEO_ENLACE";

const MODES: Array<{ value: Mode; label: string; icon: React.ReactNode }> = [
  { value: "FOTO", label: "Foto o texto", icon: <FiImage className="size-4" /> },
  { value: "VIDEO_ARCHIVO", label: "Subir video", icon: <FiVideo className="size-4" /> },
  { value: "VIDEO_ENLACE", label: "Enlace de video", icon: <FiExternalLink className="size-4" /> }
];

function modeOf(post: ContentPostItem): Mode {
  if (post.tipo === "PUBLICACION") return "FOTO";
  return post.enlaceVideo ? "VIDEO_ENLACE" : "VIDEO_ARCHIVO";
}

/** Contenido del estudio (spec 010 R4): fotos, videos y novedades para la página. */
export function ContentPanel({ posts, disciplines }: { posts: ContentPostItem[]; disciplines: DisciplineItem[] }) {
  const [editing, setEditing] = useState<{ post?: ContentPostItem } | null>(null);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Contenido</h1>
          <p className="mt-1 text-sm text-ink-500">Fotos, videos y novedades que se ven en tu página</p>
        </div>
        <Button className="w-full rounded-xl px-4 py-2 font-medium shadow-none sm:w-auto" onClick={() => setEditing({})}>
          <FiPlus className="size-4" />
          Nueva publicación
        </Button>
      </div>

      {posts.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <button
              key={post.id}
              type="button"
              onClick={() => setEditing({ post })}
              className="group overflow-hidden rounded-2xl border border-ink-200 bg-white text-left shadow-sm transition hover:border-brand-200"
            >
              <div className="relative aspect-video bg-ink-100">
                {post.mediaUrl && post.mediaKind === "IMAGEN" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.mediaUrl} alt="" className="h-full w-full object-cover" />
                ) : post.mediaUrl && post.mediaKind === "VIDEO" ? (
                  <video src={post.mediaUrl} muted className="h-full w-full bg-black object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ink-400">
                    {post.embed ? <FiVideo className="size-8" /> : <FiFileText className="size-8" />}
                  </div>
                )}
                <div className="absolute left-2 top-2 flex gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      post.publicado ? "bg-brand-500 text-white" : "bg-white/90 text-ink-600"
                    )}
                  >
                    {post.publicado ? "Publicada" : "Borrador"}
                  </span>
                  {post.fijado ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                      <BsPinAngleFill className="size-2.5" />
                      Fijada
                    </span>
                  ) : null}
                </div>
                {post.embed ? (
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold capitalize text-white">
                    {post.embed.provider}
                  </span>
                ) : null}
              </div>
              <div className="p-4">
                <p className="truncate font-semibold text-ink-800">{post.titulo}</p>
                {post.cuerpo ? <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{post.cuerpo}</p> : null}
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-400">
                  {post.discipline ? (
                    <span className="flex items-center gap-1">
                      <ColorDot color={post.discipline.color} className="size-2" />
                      {post.discipline.nombre}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span>{formatDate(post.publicadoEn ?? post.createdAt)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyCard
          title="Aún no tienes publicaciones"
          description="Sube fotos y videos de tus clases o comparte un reel de Instagram. Aparecen en Novedades de tu página."
          action={
            <Button className="rounded-xl px-4 py-2 font-medium shadow-none" onClick={() => setEditing({})}>
              <FiPlus className="size-4" />
              Nueva publicación
            </Button>
          }
        />
      )}

      {editing ? <PostModal key={editing.post?.id ?? "new"} post={editing.post} disciplines={disciplines} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function PostModal({ post, disciplines, onClose }: { post?: ContentPostItem; disciplines: DisciplineItem[]; onClose: () => void }) {
  const request = useStudioRequest();
  const [mode, setMode] = useState<Mode>(post ? modeOf(post) : "FOTO");
  const [titulo, setTitulo] = useState(post?.titulo ?? "");
  const [cuerpo, setCuerpo] = useState(post?.cuerpo ?? "");
  const [disciplineId, setDisciplineId] = useState(post?.discipline?.id ?? "");
  const { progress, saveWithMedia } = useMediaSave();
  const [photo, setPhoto] = useState<MediaDraft>(post?.mediaKind === "IMAGEN" ? draftFromSaved(post.mediaUrl, post.mediaPublicId) : null);
  const [video, setVideo] = useState<MediaDraft>(post?.mediaKind === "VIDEO" ? draftFromSaved(post.mediaUrl, post.mediaPublicId) : null);
  const [enlace, setEnlace] = useState(post?.enlaceVideo ?? "");
  const [publicado, setPublicado] = useState(post?.publicado ?? true);
  const [fijado, setFijado] = useState(post?.fijado ?? false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Un post ya creado no cambia de tipo: cambiar foto↔video dejaria su archivo huerfano.
  const lockedType = Boolean(post);
  const ready =
    titulo.trim().length >= 2 &&
    (mode === "FOTO" ? Boolean(photo || cuerpo.trim()) : mode === "VIDEO_ARCHIVO" ? Boolean(video) : Boolean(enlace.trim()));

  // Como Nubi: el archivo se sube aqui, al guardar, y no antes.
  async function save() {
    setSaving(true);
    const draft = mode === "FOTO" ? photo : mode === "VIDEO_ARCHIVO" ? video : null;
    const saved = await saveWithMedia(draft, { kind: mode === "FOTO" ? "IMAGEN" : "VIDEO", use: "publicaciones" }, (media) => {
      const body = JSON.stringify({
        tipo: mode === "FOTO" ? "PUBLICACION" : "VIDEO",
        titulo: titulo.trim(),
        cuerpo: cuerpo.trim() || null,
        disciplineId: disciplineId || null,
        media,
        enlaceVideo: mode === "VIDEO_ENLACE" ? enlace.trim() : null,
        publicado,
        fijado
      });
      return post
        ? request(`/api/content-posts/${post.id}`, { method: "PUT", body }, "Publicación guardada")
        : request("/api/content-posts", { method: "POST", body }, publicado ? "Publicado en tu página" : "Borrador guardado");
    });
    setSaving(false);
    if (saved) onClose();
  }

  async function remove() {
    setDeleting(true);
    const deleted = await request(`/api/content-posts/${post!.id}`, { method: "DELETE" }, "Publicación eliminada");
    setDeleting(false);
    if (deleted) onClose();
  }

  return (
    <>
      <Modal open onClose={() => (saving ? undefined : onClose())} title={post ? "Editar publicación" : "Nueva publicación"}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={lockedType && option.value !== mode && (option.value === "FOTO" || mode === "FOTO")}
                aria-pressed={mode === option.value}
                onClick={() => setMode(option.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition disabled:opacity-40",
                  mode === option.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
                )}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>

          {mode === "FOTO" ? (
            <MediaUploader kind="IMAGEN" value={photo} onChange={setPhoto} progress={progress} label="Foto (opcional si escribes texto)" />
          ) : mode === "VIDEO_ARCHIVO" ? (
            <MediaUploader kind="VIDEO" value={video} onChange={setVideo} progress={progress} label="Video" />
          ) : (
            <div>
              <label className={labelClass} htmlFor="post-enlace">
                Enlace de YouTube, Instagram o TikTok
              </label>
              <input
                id="post-enlace"
                value={enlace}
                onChange={(event) => setEnlace(event.target.value)}
                placeholder="https://www.instagram.com/reel/..."
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className={labelClass} htmlFor="post-titulo">
              Título
            </label>
            <input id="post-titulo" value={titulo} onChange={(event) => setTitulo(event.target.value)} className={inputClass} placeholder="Nueva clase de Jump Power" />
          </div>
          <div>
            <label className={labelClass} htmlFor="post-cuerpo">
              Texto <span className="text-ink-400">(opcional)</span>
            </label>
            <textarea id="post-cuerpo" value={cuerpo} onChange={(event) => setCuerpo(event.target.value)} className={`${inputClass} min-h-24 resize-y`} />
          </div>

          {disciplines.length ? (
            <div>
              <span className={labelClass}>Disciplina <span className="text-ink-400">(opcional)</span></span>
              <div className="flex flex-wrap gap-2">
                {[{ id: "", nombre: "Ninguna", color: "#b8c5d4" }, ...disciplines].map((discipline) => (
                  <button
                    key={discipline.id || "none"}
                    type="button"
                    aria-pressed={disciplineId === discipline.id}
                    onClick={() => setDisciplineId(discipline.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium",
                      disciplineId === discipline.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600"
                    )}
                  >
                    <ColorDot color={discipline.color} className="size-2" />
                    {discipline.nombre}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <ToggleRow label="Publicar en mi página" checked={publicado} onChange={setPublicado} />
            <ToggleRow label="Fijar arriba" checked={fijado} onChange={setFijado} />
          </div>

          <div className="flex gap-3 pt-1">
            {post ? (
              <Button type="button" variant="ghost" className="rounded-xl px-3 text-rose-600 hover:bg-rose-50" onClick={() => setConfirmDelete(true)} aria-label="Eliminar publicación">
                <FiTrash2 className="size-4" />
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1 rounded-xl py-2.5 shadow-none" loading={saving} disabled={!ready} onClick={save}>
              {post ? <FiEdit2 className="size-4" /> : null}
              {post ? "Guardar" : publicado ? "Publicar" : "Guardar borrador"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar publicación"
        description={`Eliminarás "${post?.titulo}". Su foto o video también se borra.`}
        loading={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}
