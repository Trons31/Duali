"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";
import { FiArrowRight, FiChevronDown, FiLayers, FiPlus, FiSearch, FiUsers } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency } from "@/lib/web-utils";
import type { GroupSummary } from "@/lib/web-types";

type GroupFormValues = {
  nombre: string;
  descripcion?: string;
};

export function GroupsPanel({ groups }: { groups: GroupSummary[] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const token = session?.user.apiToken ?? "";
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GroupSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupSummary | null>(null);
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"recent" | "name-asc" | "name-desc">("recent");
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors }
  } = useForm<GroupFormValues>({
    defaultValues: {
      nombre: "",
      descripcion: ""
    }
  });

  const activeStudents = useMemo(
    () => groups.reduce((total, group) => total + group.students.filter((student) => student.estado === "ACTIVO").length, 0),
    [groups]
  );

  const estimatedRevenue = useMemo(
    () =>
      groups.reduce((total, group) => {
        const groupIncome = group.students
          .filter((student) => student.estado === "ACTIVO")
          .reduce((sum, student) => sum + Number(student.precioMensualidad ?? 0), 0);
        return total + groupIncome;
      }, 0),
    [groups]
  );

  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    const items = normalizedQuery
      ? groups.filter((group) => `${group.nombre} ${group.descripcion ?? ""}`.toLocaleLowerCase("es").includes(normalizedQuery))
      : [...groups];

    if (sortOrder === "name-asc") return items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (sortOrder === "name-desc") return items.sort((a, b) => b.nombre.localeCompare(a.nombre, "es"));
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [groups, query, sortOrder]);

  function openCreateModal() {
    setEditTarget(null);
    reset({ nombre: "", descripcion: "" });
    setCreateOpen(true);
  }

  function openEditModal(group: GroupSummary) {
    setEditTarget(group);
    reset({
      nombre: group.nombre,
      descripcion: group.descripcion ?? ""
    });
    setCreateOpen(true);
  }

  function closeCreateModal() {
    if (isSubmitting) return;
    setCreateOpen(false);
    setEditTarget(null);
    reset({ nombre: "", descripcion: "" });
  }

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      nombre: values.nombre.trim(),
      descripcion: values.descripcion?.trim() || undefined
    };
    const isEditing = Boolean(editTarget);

    await clientApiFetch(isEditing ? `/api/groups/${editTarget?.id}` : "/api/groups", token, {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify(payload)
    })
      .then(() => {
        sileo.success({
          title: isEditing ? "Grupo actualizado" : "Grupo creado",
          description: isEditing ? "Los cambios del grupo ya quedaron guardados." : "Ya puedes asignarle alumnos."
        });
        closeCreateModal();
        router.refresh();
      })
      .catch((error: Error) => {
        sileo.error({
          title: isEditing ? "No se pudo actualizar" : "No se pudo crear",
          description: error.message
        });
      });
  });

  async function deleteGroup() {
    if (!deleteTarget) return;
    await clientApiFetch(`/api/groups/${deleteTarget.id}`, token, { method: "DELETE" })
      .then(() => {
        sileo.success({ title: "Grupo eliminado" });
        setDeleteTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <FiLayers className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-700">Organización</p>
              <h1 className="mt-1 text-[2rem] font-black leading-none text-ink-950 sm:text-[2.25rem]">Grupos</h1>
              <p className="mt-2 max-w-2xl text-sm leading-5 text-ink-500">
                Organiza cursos o niveles y consulta sus alumnos e ingresos estimados.
              </p>
            </div>
          </div>

          <Button
            className="min-h-10 self-end rounded-xl px-4 py-2.5 text-sm font-bold sm:shrink-0"
            onClick={openCreateModal}
          >
            <FiPlus className="size-4" />
            Crear grupo
          </Button>
        </header>

        <section className="rounded-[24px] border border-ink-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-ink-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-xl font-black text-ink-950">
                Listado de grupos <span className="font-semibold text-ink-500">({groups.length})</span>
              </h2>
              <p className="mt-1 text-sm text-ink-500">Organización general de tu academia</p>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-ink-600 sm:justify-start">
              <span>Ordenar por</span>
              <span className="relative">
                <select
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
                  className="h-10 appearance-none rounded-xl border border-ink-200 bg-white pl-3 pr-9 text-sm font-semibold text-ink-800 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                >
                  <option value="recent">Más recientes</option>
                  <option value="name-asc">Nombre A-Z</option>
                  <option value="name-desc">Nombre Z-A</option>
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
              </span>
            </label>
          </div>

          <div className="border-b border-ink-100 p-4 sm:px-6 sm:py-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <SummaryPill label="Grupos" value={groups.length} helper="creados" />
              <SummaryPill label="Alumnos" value={activeStudents} helper="activos" />
              <SummaryPill
                className="col-span-2 sm:col-span-1"
                label="Ingreso estimado"
                value={currency(estimatedRevenue)}
                helper="mensual"
              />
            </div>

            <label className="relative mt-3 block">
              <span className="sr-only">Buscar grupos</span>
              <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre o descripción"
                className="field-base h-11 rounded-xl py-2 pl-10 text-sm"
              />
            </label>
          </div>

          {visibleGroups.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-ink-50 text-ink-400">
                <FiUsers className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-ink-950">
                {groups.length === 0 ? "Aún no tienes grupos" : "No encontramos grupos"}
              </h3>
              <p className="mt-2 text-sm text-ink-500">
                {groups.length === 0
                  ? "Crea tu primer grupo para empezar a organizar alumnos y cobros."
                  : "Prueba con otro nombre o descripción."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6 xl:grid-cols-3">
              {visibleGroups.map((group) => (
                <article
                  key={group.id}
                  className="h-full rounded-2xl border border-ink-100 bg-white p-4 shadow-sm transition hover:border-brand-100 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-brand-50 text-sm font-bold text-brand-700">
                      {group.nombre.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => router.push(`/dashboard/grupos/${group.id}`)}
                      >
                        <h3 className="text-[15px] font-semibold text-ink-950">{group.nombre}</h3>
                        <p className="mt-1 text-sm text-ink-500">{group.descripcion || "Sin descripción registrada."}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/grupos/${group.id}`)}
                        className="rounded-xl p-1.5 text-ink-300 transition hover:bg-ink-50 hover:text-ink-600"
                        aria-label={`Ver detalle de ${group.nombre}`}
                      >
                        <FiArrowRight className="size-4 shrink-0" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <GroupInfoBlock label="Alumnos" value={group._count.students} helper={`${countActiveStudents(group)} activos`} />
                    <GroupInfoBlock label="Cobros" value={group._count.monthlyPayments} helper="registrados" />
                    <GroupInfoBlock
                      className="col-span-2"
                      label="Ingreso estimado"
                      value={currency(estimateGroupMonthlyIncome(group))}
                      helper="mensual"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-9 rounded-xl px-3.5 py-2 text-[13px] font-semibold"
                      onClick={() => openEditModal(group)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-9 rounded-xl px-3.5 py-2 text-[13px] font-semibold"
                      onClick={() => setDeleteTarget(group)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title={editTarget ? "Editar grupo" : "Nuevo grupo"}
        description={
          editTarget
            ? "Actualiza el nombre o la descripción del grupo. El ingreso estimado seguirá saliendo de las mensualidades de sus alumnos."
            : "Crea un grupo para organizar alumnos por nivel, horario o curso."
        }
      >
        <form className="space-y-5" onSubmit={onSubmit}>
         
          <Field label="Nombre del grupo" error={errors.nombre?.message}>
            <input className="field-base" {...register("nombre", { required: "Ingresa el nombre del grupo" })} />
          </Field>

          <Field label="Descripción">
            <textarea className="field-base min-h-28 resize-none" {...register("descripcion")} />
          </Field>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-11 flex-1 rounded-[18px]" type="button" variant="secondary" onClick={closeCreateModal}>
              Cancelar
            </Button>
            <Button className="min-h-11 flex-1 rounded-[18px]" type="submit" loading={isSubmitting}>
              {editTarget ? "Guardar cambios" : "Guardar grupo"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar grupo"
        description={`Eliminarás "${deleteTarget?.nombre}". Los históricos se conservan, pero el grupo dejará de verse en la operación activa.`}
        notice="Elimina este grupo solo si ya no lo vas a usar en la organizacion activa del negocio."
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteGroup}
      />
    </div>
  );
}

function SummaryPill({
  label,
  value,
  helper,
  className
}: {
  label: string;
  value: number | string;
  helper: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-ink-100 bg-ink-50/70 p-3 sm:p-4", className)}>
      <p className="text-[11px] font-semibold text-ink-500 sm:text-xs">{label}</p>
      <p className="mt-2 break-words text-xl font-black leading-none text-ink-950 sm:text-2xl">{value}</p>
      <p className="mt-1.5 text-[11px] text-ink-400 sm:text-xs">{helper}</p>
    </div>
  );
}

function GroupInfoBlock({
  label,
  value,
  helper,
  className
}: {
  label: string;
  value: number | string;
  helper: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-ink-100 bg-ink-50/65 p-3", className)}>
      <p className="text-[11px] font-semibold leading-4 text-ink-500">{label}</p>
      <p className="mt-1 break-words text-base font-black leading-5 text-ink-950">{value}</p>
      <p className="mt-1 text-[10px] font-medium leading-4 text-ink-400">{helper}</p>
    </div>
  );
}

function Field({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-black text-ink-900">{label}</span>
      {children}
      {error ? <span className="block text-sm font-semibold text-rose-600">{error}</span> : null}
    </label>
  );
}

function countActiveStudents(group: GroupSummary) {
  return group.students.filter((student) => student.estado === "ACTIVO").length;
}

function estimateGroupMonthlyIncome(group: GroupSummary) {
  return group.students
    .filter((student) => student.estado === "ACTIVO")
    .reduce((sum, student) => sum + Number(student.precioMensualidad ?? 0), 0);
}
