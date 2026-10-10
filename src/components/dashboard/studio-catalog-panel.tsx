"use client";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { FiEdit2, FiEyeOff, FiLayers, FiPauseCircle, FiPlus, FiTrash2 } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { MediaUploader, draftFromSaved, useMediaSave, type MediaDraft } from "@/components/dashboard/media-uploader";
import { ColorDot, EmptyCard, ToggleRow, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import { DISCIPLINE_COLORS } from "@/lib/studio-constants";
import { cn, currency } from "@/lib/web-utils";
import type { DisciplineItem, PackageItem } from "@/lib/web-types";

type Tab = "precios" | "disciplinas";

/**
 * Catalogo del estudio (specs 003 y 004). Precios va primero porque es lo que el
 * negocio mira y edita a diario; Disciplinas se toca al montar el estudio.
 */
export function StudioCatalogPanel({
  disciplines,
  packages
}: {
  disciplines: DisciplineItem[];
  packages: PackageItem[];
}) {
  const [tab, setTab] = useState<Tab>(disciplines.length ? "precios" : "disciplinas");
  const [packageModal, setPackageModal] = useState<{ item?: PackageItem; disciplineId?: string } | null>(null);
  const [disciplineModal, setDisciplineModal] = useState<{ item?: DisciplineItem; tipo: "CLASE" | "COMBO" } | null>(
    null
  );

  const packagesByDiscipline = useMemo(() => {
    const map = new Map<string, PackageItem[]>();
    for (const item of packages) map.set(item.disciplineId, [...(map.get(item.disciplineId) ?? []), item]);
    return map;
  }, [packages]);

  const activeDisciplines = disciplines.filter((discipline) => discipline.activa);
  const classDisciplines = disciplines.filter((discipline) => discipline.tipo === "CLASE");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Paquetes</h1>
          <p className="mt-1 text-sm text-ink-500">Disciplinas, paquetes de clases y sus precios</p>
        </div>
        {tab === "precios" ? (
          <Button
            className="w-full rounded-xl px-4 py-2 font-medium shadow-none sm:w-auto"
            disabled={!activeDisciplines.length}
            onClick={() => setPackageModal({})}
          >
            <FiPlus className="size-4" />
            Nuevo paquete
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 rounded-xl px-4 py-2 font-medium sm:flex-none"
              disabled={classDisciplines.length < 2}
              title={classDisciplines.length < 2 ? "Necesitas al menos 2 disciplinas para armar un combo" : undefined}
              onClick={() => setDisciplineModal({ tipo: "COMBO" })}
            >
              <FiLayers className="size-4" />
              Nuevo combo
            </Button>
            <Button
              className="flex-1 rounded-xl px-4 py-2 font-medium shadow-none sm:flex-none"
              onClick={() => setDisciplineModal({ tipo: "CLASE" })}
            >
              <FiPlus className="size-4" />
              Nueva disciplina
            </Button>
          </div>
        )}
      </div>

      <div className="inline-flex rounded-xl border border-ink-200 bg-white p-1 shadow-sm" role="tablist">
        {(
          [
            ["precios", "Precios"],
            ["disciplinas", "Disciplinas"]
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              tab === value ? "bg-brand-500 text-white shadow-sm" : "text-ink-600 hover:bg-ink-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "precios" ? (
        disciplines.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {disciplines.map((discipline) => (
              <PriceCard
                key={discipline.id}
                discipline={discipline}
                packages={packagesByDiscipline.get(discipline.id) ?? []}
                onAdd={() => setPackageModal({ disciplineId: discipline.id })}
                onEdit={(item) => setPackageModal({ item })}
              />
            ))}
          </div>
        ) : (
          <EmptyCard
            title="Primero crea tus disciplinas"
            description="Cada disciplina (o combo) tiene su propia lista de paquetes y precios."
            action={
              <Button className="rounded-xl px-4 py-2 font-medium shadow-none" onClick={() => setTab("disciplinas")}>
                Ir a Disciplinas
              </Button>
            }
          />
        )
      ) : disciplines.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {disciplines.map((discipline) => (
            <DisciplineCard
              key={discipline.id}
              discipline={discipline}
              packageCount={packagesByDiscipline.get(discipline.id)?.length ?? 0}
              onEdit={() => setDisciplineModal({ item: discipline, tipo: discipline.tipo })}
            />
          ))}
        </div>
      ) : (
        <EmptyCard
          title="Aún no tienes disciplinas"
          description="Ej: Body Combat, Rumba Fit, Jump Power. Después podrás agruparlas en un combo como Mix Studio."
          action={
            <Button
              className="rounded-xl px-4 py-2 font-medium shadow-none"
              onClick={() => setDisciplineModal({ tipo: "CLASE" })}
            >
              <FiPlus className="size-4" />
              Nueva disciplina
            </Button>
          }
        />
      )}

      {packageModal ? (
        <PackageModal
          key={packageModal.item?.id ?? `new-${packageModal.disciplineId ?? ""}`}
          item={packageModal.item}
          initialDisciplineId={packageModal.disciplineId}
          disciplines={activeDisciplines}
          allDisciplines={disciplines}
          nameSuggestions={[...new Set(packages.map((item) => item.nombre))]}
          onClose={() => setPackageModal(null)}
        />
      ) : null}

      {disciplineModal ? (
        <DisciplineModal
          key={disciplineModal.item?.id ?? `new-${disciplineModal.tipo}`}
          item={disciplineModal.item}
          tipo={disciplineModal.tipo}
          classDisciplines={classDisciplines.filter((discipline) => discipline.activa || disciplineModal.item)}
          onClose={() => setDisciplineModal(null)}
        />
      ) : null}
    </div>
  );
}

function classesLabel(clases: number) {
  return clases === 1 ? "Clase suelta" : `${clases} clases/mes`;
}

/** Una tarjeta por disciplina, como cada historia del menu en Instagram. */
function PriceCard({
  discipline,
  packages,
  onAdd,
  onEdit
}: {
  discipline: DisciplineItem;
  packages: PackageItem[];
  onAdd: () => void;
  onEdit: (item: PackageItem) => void;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm",
        !discipline.activa && "opacity-60"
      )}
    >
      <div className="h-1.5" style={{ backgroundColor: discipline.color }} />
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ColorDot color={discipline.color} />
            <h2 className="truncate font-semibold text-ink-800">{discipline.nombre}</h2>
          </div>
          {discipline.tipo === "COMBO" ? (
            <p className="mt-0.5 truncate text-xs text-ink-400">
              Combo · {discipline.incluye.map((item) => item.nombre).join(" + ")}
            </p>
          ) : null}
        </div>
        {!discipline.activa ? (
          <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">Inactiva</span>
        ) : null}
      </div>

      <ul className="flex-1 divide-y divide-ink-100 px-2">
        {packages.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-ink-50"
            >
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-semibold text-ink-800", !item.activo && "text-ink-400 line-through")}>
                  {item.nombre}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                  {classesLabel(item.clases)}
                  {!item.visiblePublico ? <FiEyeOff className="size-3 text-ink-400" title="Oculto en la página pública" /> : null}
                  {!item.activo ? <FiPauseCircle className="size-3 text-amber-500" title="Pausado" /> : null}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-ink-900">{currency(item.precio)}</span>
              <FiEdit2 className="size-3.5 shrink-0 text-ink-300 group-hover:text-brand-500" />
            </button>
          </li>
        ))}
        {!packages.length ? <li className="px-2 py-4 text-center text-xs text-ink-400">Sin paquetes todavía</li> : null}
      </ul>

      {discipline.activa ? (
        <div className="p-3 pt-2">
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-200 px-3 py-2 text-xs font-medium text-ink-500 transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            <FiPlus className="size-3.5" />
            Agregar paquete
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DisciplineCard({
  discipline,
  packageCount,
  onEdit
}: {
  discipline: DisciplineItem;
  packageCount: number;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-200",
        !discipline.activa && "opacity-60"
      )}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
        style={{ backgroundColor: discipline.color }}
      >
        {discipline.tipo === "COMBO" ? <FiLayers className="size-4" /> : discipline.nombre.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-ink-800">{discipline.nombre}</p>
          {discipline.tipo === "COMBO" ? (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">Combo</span>
          ) : null}
          {!discipline.activa ? (
            <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">Inactiva</span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">
          {discipline.descripcion || (discipline.tipo === "COMBO" ? "Una sola bolsa de clases para varias disciplinas" : "Sin descripción")}
        </p>
        {discipline.tipo === "COMBO" ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {discipline.incluye.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-0.5 text-[11px] font-medium text-ink-600"
              >
                <ColorDot color={item.color} className="size-2" />
                {item.nombre}
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-[11px] font-medium text-ink-400">
          {packageCount} paquete{packageCount === 1 ? "" : "s"}
        </p>
      </div>
    </button>
  );
}

type PackageFormValues = {
  nombre: string;
  clases: string;
  precio: string;
  vigenciaDias: string;
  visiblePublico: boolean;
  activo: boolean;
  disciplineIds: string[];
};

function PackageModal({
  item,
  initialDisciplineId,
  disciplines,
  allDisciplines,
  nameSuggestions,
  onClose
}: {
  item?: PackageItem;
  initialDisciplineId?: string;
  disciplines: DisciplineItem[];
  allDisciplines: DisciplineItem[];
  nameSuggestions: string[];
  onClose: () => void;
}) {
  const request = useStudioRequest();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEditing = Boolean(item);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting, errors }
  } = useForm<PackageFormValues>({
    defaultValues: {
      nombre: item?.nombre ?? "",
      clases: String(item?.clases ?? ""),
      precio: item ? String(Math.round(Number(item.precio))) : "",
      vigenciaDias: String(item?.vigenciaDias ?? 30),
      visiblePublico: item?.visiblePublico ?? true,
      activo: item?.activo ?? true,
      disciplineIds: item ? [item.disciplineId] : initialDisciplineId ? [initialDisciplineId] : []
    }
  });
  const selectedIds = watch("disciplineIds");
  const clases = Number(watch("clases"));
  const discipline = item ? allDisciplines.find((entry) => entry.id === item.disciplineId) : null;

  function toggleDiscipline(id: string) {
    setValue(
      "disciplineIds",
      selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id],
      { shouldValidate: true }
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      nombre: values.nombre.trim(),
      clases: Number(values.clases),
      precio: Number(values.precio || 0),
      vigenciaDias: Number(values.vigenciaDias || 30),
      visiblePublico: values.visiblePublico,
      activo: values.activo
    };

    const saved = isEditing
      ? await request(`/api/packages/${item!.id}`, { method: "PUT", body: JSON.stringify(payload) }, "Paquete actualizado")
      : await request(
          "/api/packages",
          { method: "POST", body: JSON.stringify({ ...payload, disciplineIds: values.disciplineIds }) },
          values.disciplineIds.length > 1 ? `${values.disciplineIds.length} paquetes creados` : "Paquete creado"
        );

    if (saved) onClose();
  });

  async function handleDelete() {
    setDeleting(true);
    const deleted = await request(`/api/packages/${item!.id}`, { method: "DELETE" }, "Paquete eliminado");
    setDeleting(false);
    if (deleted) onClose();
  }

  return (
    <>
      <Modal
        open
        onClose={() => (isSubmitting ? undefined : onClose())}
        title={isEditing ? "Editar paquete" : "Nuevo paquete"}
        description={
          isEditing
            ? `${discipline?.nombre ?? ""} · el cambio de precio aplica a las próximas ventas.`
            : "Si eliges varias disciplinas se crea un paquete igual en cada una; luego puedes ajustar el precio de cada una."
        }
      >
        <form className="space-y-4" onSubmit={onSubmit}>
          {!isEditing ? (
            <div>
              <span className={labelClass}>Disciplinas</span>
              <input type="hidden" {...register("disciplineIds", { validate: (value) => value.length > 0 || "Elige al menos una" })} />
              <div className="flex flex-wrap gap-2">
                {disciplines.map((entry) => {
                  const selected = selectedIds.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => toggleDiscipline(entry.id)}
                      aria-pressed={selected}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                        selected ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
                      )}
                    >
                      <ColorDot color={entry.color} className="size-2.5" />
                      {entry.nombre}
                    </button>
                  );
                })}
              </div>
              {errors.disciplineIds ? (
                <p className="mt-1 text-xs font-medium text-rose-600">{errors.disciplineIds.message}</p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className={labelClass} htmlFor="package-nombre">
              Nombre
            </label>
            <input
              id="package-nombre"
              list="package-name-suggestions"
              className={inputClass}
              placeholder="Básico, Plus, Premium…"
              {...register("nombre", { required: "Ingresa el nombre", minLength: { value: 2, message: "Muy corto" } })}
            />
            <datalist id="package-name-suggestions">
              {[...new Set(["Individual", "Básico", "Plus", "Premium", ...nameSuggestions])].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {errors.nombre ? <p className="mt-1 text-xs font-medium text-rose-600">{errors.nombre.message}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="package-clases">
                Clases
              </label>
              <input
                id="package-clases"
                type="number"
                inputMode="numeric"
                min={1}
                className={inputClass}
                placeholder="4"
                {...register("clases", { required: "Requerido", min: { value: 1, message: "Mínimo 1" } })}
              />
              <p className="mt-1 text-[11px] text-ink-400">
                {clases === 1 ? "1 clase = clase suelta del día" : "Clases que incluye el paquete"}
              </p>
            </div>
            <div>
              <label className={labelClass}>Precio</label>
              <Controller
                control={control}
                name="precio"
                rules={{ required: "Requerido" }}
                render={({ field }) => (
                  <MoneyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    className="h-[42px] rounded-xl py-2.5 text-sm"
                    aria-label="Precio"
                  />
                )}
              />
              {errors.precio ? <p className="mt-1 text-xs font-medium text-rose-600">{errors.precio.message}</p> : null}
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="package-vigencia">
              Vigencia (días)
            </label>
            <input
              id="package-vigencia"
              type="number"
              inputMode="numeric"
              min={1}
              max={366}
              className={inputClass}
              {...register("vigenciaDias", { required: true, min: 1, max: 366 })}
            />
            <p className="mt-1 text-[11px] text-ink-400">Cuenta desde que se activa el paquete. Las clases no usadas se pierden.</p>
          </div>

          <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <ToggleRow
              label="Visible en la página pública"
              checked={watch("visiblePublico")}
              onChange={(value) => setValue("visiblePublico", value)}
            />
            <ToggleRow
              label="Disponible para la venta"
              checked={watch("activo")}
              onChange={(value) => setValue("activo", value)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl px-3 text-rose-600 hover:bg-rose-50"
                onClick={() => setConfirmDelete(true)}
                aria-label="Eliminar paquete"
              >
                <FiTrash2 className="size-4" />
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 rounded-xl py-2.5 shadow-none" loading={isSubmitting}>
              {isEditing ? "Guardar" : "Crear paquete"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar paquete"
        description={`Eliminarás "${item?.nombre}" de ${discipline?.nombre ?? "la disciplina"}.`}
        notice="Si solo quieres dejar de venderlo por un tiempo, desactiva “Disponible para la venta”."
        loading={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

type DisciplineFormValues = {
  nombre: string;
  descripcion: string;
  color: string;
  activa: boolean;
  incluyeIds: string[];
  imagen: MediaDraft;
};

function DisciplineModal({
  item,
  tipo,
  classDisciplines,
  onClose
}: {
  item?: DisciplineItem;
  tipo: "CLASE" | "COMBO";
  classDisciplines: DisciplineItem[];
  onClose: () => void;
}) {
  const request = useStudioRequest();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEditing = Boolean(item);
  const isCombo = tipo === "COMBO";
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting, errors }
  } = useForm<DisciplineFormValues>({
    defaultValues: {
      nombre: item?.nombre ?? "",
      descripcion: item?.descripcion ?? "",
      color: item?.color ?? DISCIPLINE_COLORS[0],
      activa: item?.activa ?? true,
      imagen: draftFromSaved(item?.imagenUrl, item?.imagenPublicId),
      incluyeIds: item?.incluye.map((entry) => entry.id) ?? (isCombo ? classDisciplines.map((entry) => entry.id) : [])
    }
  });
  const color = watch("color");
  const incluyeIds = watch("incluyeIds");
  const { progress, saveWithMedia } = useMediaSave();

  // Como Nubi: la imagen se sube al guardar, no al elegirla.
  const onSubmit = handleSubmit(async (values) => {
    const label = isCombo ? "Combo" : "Disciplina";
    const saved = await saveWithMedia(values.imagen, { kind: "IMAGEN", use: "disciplinas" }, (imagen) => {
      const payload = JSON.stringify({
        tipo,
        nombre: values.nombre.trim(),
        descripcion: values.descripcion.trim() || null,
        color: values.color,
        imagen,
        ...(isEditing ? { activa: values.activa } : {}),
        ...(isCombo ? { incluyeIds: values.incluyeIds } : {})
      });
      return isEditing
        ? request(`/api/disciplines/${item!.id}`, { method: "PUT", body: payload }, `${label} actualizado`)
        : request("/api/disciplines", { method: "POST", body: payload }, `${label} creado`);
    });

    if (saved) onClose();
  });

  async function handleDelete() {
    setDeleting(true);
    const deleted = await request(`/api/disciplines/${item!.id}`, { method: "DELETE" }, "Eliminado");
    setDeleting(false);
    if (deleted) onClose();
  }

  return (
    <>
      <Modal size="md"
        open
        onClose={() => (isSubmitting ? undefined : onClose())}
        title={`${isEditing ? "Editar" : "Nuevo"} ${isCombo ? "combo" : "disciplina"}`}
        description={
          isCombo
            ? "Un combo es una sola bolsa de clases que sirve para varias disciplinas (ej. Mix Studio)."
            : "La clase que dictas: Body Combat, Rumba Fit, Jump Power…"
        }
      >
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className={labelClass} htmlFor="discipline-nombre">
              Nombre
            </label>
            <input
              id="discipline-nombre"
              className={inputClass}
              placeholder={isCombo ? "Mix Studio" : "Body Combat"}
              {...register("nombre", { required: "Ingresa el nombre", minLength: { value: 2, message: "Muy corto" } })}
            />
            {errors.nombre ? <p className="mt-1 text-xs font-medium text-rose-600">{errors.nombre.message}</p> : null}
          </div>

          <div>
            <label className={labelClass} htmlFor="discipline-descripcion">
              Descripción <span className="text-ink-400">(opcional)</span>
            </label>
            <textarea
              id="discipline-descripcion"
              className={`${inputClass} min-h-20 resize-none`}
              placeholder="Se mostrará en tu página pública"
              {...register("descripcion")}
            />
          </div>

          <MediaUploader
            kind="IMAGEN"
            progress={progress}
            label="Imagen (opcional, se ve en tu página)"
            value={watch("imagen")}
            onChange={(value) => setValue("imagen", value)}
          />

          {isCombo ? (
            <div>
              <span className={labelClass}>Incluye</span>
              <div className="flex flex-wrap gap-2">
                {classDisciplines.map((entry) => {
                  const selected = incluyeIds.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setValue(
                          "incluyeIds",
                          selected ? incluyeIds.filter((value) => value !== entry.id) : [...incluyeIds, entry.id]
                        )
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                        selected ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
                      )}
                    >
                      <ColorDot color={entry.color} className="size-2.5" />
                      {entry.nombre}
                    </button>
                  );
                })}
              </div>
              {incluyeIds.length < 2 ? <p className="mt-1 text-xs text-amber-600">Elige al menos 2 disciplinas.</p> : null}
            </div>
          ) : null}

          <div>
            <span className={labelClass}>Color</span>
            <div className="flex flex-wrap gap-2">
              {DISCIPLINE_COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue("color", value)}
                  aria-label={`Color ${value}`}
                  aria-pressed={color === value}
                  className={cn(
                    "size-8 rounded-full ring-offset-2 transition",
                    color === value ? "ring-2 ring-ink-800" : "hover:scale-110"
                  )}
                  style={{ backgroundColor: value }}
                />
              ))}
            </div>
          </div>

          {isEditing ? (
            <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
              <ToggleRow label="Activa" checked={watch("activa")} onChange={(value) => setValue("activa", value)} />
            </div>
          ) : null}

          <div className="flex gap-3 pt-1">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl px-3 text-rose-600 hover:bg-rose-50"
                onClick={() => setConfirmDelete(true)}
                aria-label="Eliminar"
              >
                <FiTrash2 className="size-4" />
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 rounded-xl py-2.5 shadow-none"
              loading={isSubmitting}
              disabled={isCombo && incluyeIds.length < 2}
            >
              {isEditing ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={`Eliminar ${isCombo ? "combo" : "disciplina"}`}
        description={`Eliminarás "${item?.nombre}".`}
        notice="Solo se puede eliminar si no tiene paquetes ni está dentro de un combo. Si quieres conservarla, desactívala."
        loading={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}
