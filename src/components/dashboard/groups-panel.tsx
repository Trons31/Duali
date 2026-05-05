"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";
import { FiArrowRight, FiPlus, FiUsers } from "react-icons/fi";
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
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-white px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft sm:px-6 sm:py-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-400">Organización</p>
                <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-ink-950 sm:text-[2.2rem]">Grupos</h1>
                <p className="mt-2 text-sm text-ink-500">Organiza cursos o niveles y sigue el ingreso estimado según las mensualidades reales de sus alumnos.</p>
              </div>
              <Button className="min-h-11 rounded-[18px] px-5 text-sm font-semibold" onClick={openCreateModal}>
                <FiPlus className="size-4" />
                Crear grupo
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryPill label="Grupos creados" value={groups.length} helper="activos en tu panel" />
              <SummaryPill label="Alumnos activos" value={activeStudents} helper="sumados entre todos los grupos" />
              <SummaryPill label="Ingreso estimado" value={currency(estimatedRevenue)} helper="según mensualidades configuradas" />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink-100 bg-white shadow-soft">
          <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold text-ink-950">Listado de grupos</h2>
              <p className="mt-1 text-sm text-ink-500">{groups.length} grupos en total</p>
            </div>
            <p className="text-sm text-ink-500">El estimado se calcula con las mensualidades propias de los alumnos activos.</p>
          </div>

          {groups.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-ink-50 text-ink-400">
                <FiUsers className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-ink-950">Aún no tienes grupos</h3>
              <p className="mt-2 text-sm text-ink-500">Crea tu primer grupo para empezar a organizar alumnos y cobros.</p>
            </div>
          ) : (
            <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-6 sm:py-6 xl:grid-cols-3">
              {groups.map((group) => (
                <article
                  key={group.id}
                  className="rounded-[24px] border border-ink-100 bg-white px-4 py-4 shadow-sm transition hover:border-ink-200 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-brand-50 text-sm font-bold text-brand-700">
                      {group.nombre.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEditModal(group)}>
                          <h3 className="text-[15px] font-semibold text-ink-950">{group.nombre}</h3>
                          <p className="mt-1 text-sm text-ink-500">{group.descripcion || "Sin descripción registrada."}</p>
                        </button>
                        <FiArrowRight className="mt-0.5 size-4 shrink-0 text-ink-300" />
                      </div>

                      <div className="mt-4 grid gap-3">
                        <GroupInfoBlock label="Alumnos" value={group._count.students} helper={`${countActiveStudents(group)} activos`} />
                        <GroupInfoBlock label="Ingreso estimado" value={currency(estimateGroupMonthlyIncome(group))} helper="suma de mensualidades activas" />
                        <GroupInfoBlock label="Cobros registrados" value={group._count.monthlyPayments} helper="histórico de mensualidades" />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-9 rounded-[14px] px-3.5 py-2 text-[13px] font-semibold"
                          onClick={() => openEditModal(group)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-9 rounded-[14px] px-3.5 py-2 text-[13px] font-semibold"
                          onClick={() => setDeleteTarget(group)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
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
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteGroup}
      />
    </div>
  );
}

function SummaryPill({ label, value, helper }: { label: string; value: number | string; helper: string }) {
  return (
    <div className="rounded-[22px] border border-ink-100 bg-ink-50/70 px-4 py-4">
      <p className="text-[12px] font-semibold text-ink-500">{label}</p>
      <p className="mt-3 text-[1.45rem] font-bold tracking-tight text-ink-950">{value}</p>
      <p className="mt-1 text-xs text-ink-400">{helper}</p>
    </div>
  );
}

function GroupInfoBlock({ label, value, helper }: { label: string; value: number | string; helper: string }) {
  return (
    <div className="rounded-[18px] border border-ink-100 bg-ink-50/65 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <p className="mt-2 text-[15px] font-semibold text-ink-950">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{helper}</p>
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
