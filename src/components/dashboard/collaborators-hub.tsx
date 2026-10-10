"use client";

import { useState } from "react";
import { FiChevronDown, FiChevronUp, FiPlus, FiShield, FiUserCheck, FiUsers } from "react-icons/fi";
import { Avatar, InstructorFormModal, InstructorsPanel } from "@/components/dashboard/instructors-panel";
import { inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  COLLABORATOR_PERMISSION_GROUPS,
  COLLABORATOR_PERMISSION_KEYS,
  normalizePermissions,
  type CollaboratorPermissions,
  type CollaboratorRole
} from "@/lib/collaborator-permissions";
import type { CollaboratorView } from "@/lib/collaborators";
import type { InstructorView } from "@/lib/instructors";
import { cn } from "@/lib/web-utils";
import type { DisciplineItem } from "@/lib/web-types";

type Tab = "INSTRUCTORES" | "ADMIN" | "SOCIO";

/**
 * Spec 024 R1/R2: el equipo en un solo lugar, como Colaboradores de CliqCut.
 * Solo la dueña ve y crea administradores y socios.
 */
export function CollaboratorsHub({
  instructors,
  disciplines,
  unregistered,
  collaborators,
  isOwner,
  canEditTeam
}: {
  instructors: InstructorView[];
  disciplines: DisciplineItem[];
  unregistered: string[];
  collaborators: CollaboratorView[];
  isOwner: boolean;
  canEditTeam: boolean;
}) {
  const [tab, setTab] = useState<Tab>("INSTRUCTORES");
  const [adding, setAdding] = useState(false);
  const [newInstructor, setNewInstructor] = useState(false);
  const [editing, setEditing] = useState<{ rol: CollaboratorRole; item: CollaboratorView | null } | null>(null);
  const admins = collaborators.filter((item) => item.rol === "ADMIN");
  const partners = collaborators.filter((item) => item.rol === "SOCIO");

  const tabs: Array<{ key: Tab; label: string; icon: typeof FiUsers; count: number }> = [
    { key: "INSTRUCTORES", label: "Instructores", icon: FiUserCheck, count: instructors.filter((item) => item.activo).length },
    ...(isOwner
      ? [
          { key: "ADMIN" as const, label: "Administradores", icon: FiShield, count: admins.filter((item) => item.activo).length },
          { key: "SOCIO" as const, label: "Socios", icon: FiUsers, count: partners.filter((item) => item.activo).length }
        ]
      : [])
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Colaboradores</h1>
          <p className="mt-1 text-sm text-ink-500">{isOwner ? "Tu equipo y quién puede entrar al sistema" : "Quién da cada clase y cómo se le paga"}</p>
        </div>
        {canEditTeam ? (
          // Un solo boton, como CliqCut: el tipo se elige dentro.
          <Button className="w-full rounded-xl px-4 py-2 font-medium shadow-none sm:w-auto" onClick={() => (isOwner ? setAdding(true) : setNewInstructor(true))}>
            <FiPlus className="size-4" />
            {isOwner ? "Agregar colaborador" : "Nuevo instructor"}
          </Button>
        ) : null}
      </div>

      {tabs.length > 1 ? (
        <nav className="flex gap-1 overflow-x-auto border-b border-ink-200" role="tablist" aria-label="Tipo de colaborador">
          {tabs.map((item) => {
            const Icon = item.icon;
            const selected = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.key)}
                className={cn(
                  "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
                  selected ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-bold", selected ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500")}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {tab === "INSTRUCTORES" ? (
        <InstructorsPanel instructors={instructors} disciplines={disciplines} unregistered={unregistered} embedded readOnly={!canEditTeam} />
      ) : (
        <AccessList
          rol={tab}
          items={tab === "ADMIN" ? admins : partners}
          onAdd={() => setEditing({ rol: tab, item: null })}
          onOpen={(item) => setEditing({ rol: item.rol, item })}
        />
      )}

      {adding ? (
        <AddWizard
          onClose={() => setAdding(false)}
          onChoose={(choice) => {
            setAdding(false);
            if (choice === "INSTRUCTOR") setNewInstructor(true);
            else setEditing({ rol: choice, item: null });
          }}
        />
      ) : null}
      {newInstructor ? <InstructorFormModal instructor={null} disciplines={disciplines} onClose={() => setNewInstructor(false)} /> : null}
      {editing ? (
        <CollaboratorFormModal
          key={editing.item?.id ?? `new-${editing.rol}`}
          rol={editing.rol}
          item={editing.item}
          onClose={(savedRol) => {
            setEditing(null);
            if (savedRol) setTab(savedRol);
          }}
        />
      ) : null}
    </div>
  );
}

function lastAccess(iso: string | null) {
  if (!iso) return "Aún no ha entrado";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Entró hoy";
  if (days === 1) return "Entró ayer";
  return `Entró hace ${days} días`;
}

function AccessList({
  rol,
  items,
  onAdd,
  onOpen
}: {
  rol: CollaboratorRole;
  items: CollaboratorView[];
  onAdd: () => void;
  onOpen: (item: CollaboratorView) => void;
}) {
  const [showInactive, setShowInactive] = useState(false);
  const active = items.filter((item) => item.activo);
  const inactive = items.filter((item) => !item.activo);
  const total = COLLABORATOR_PERMISSION_KEYS.length;
  const label = rol === "ADMIN" ? "administradores" : "socios";

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">
        {rol === "ADMIN"
          ? "Entran al sistema con su correo y ven solo lo que tú les permitas."
          : "Entran al sistema con su correo y ven todo, menos tu plan y los administradores y socios."}
      </p>
      {active.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.map((item) => (
            <AccessCard key={item.id} item={item} total={total} onOpen={() => onOpen(item)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ink-200 p-8 text-center">
          <p className="text-sm text-ink-500">Aún no tienes {label}.</p>
          <Button className="rounded-xl px-4 py-2 font-medium shadow-none" onClick={onAdd}>
            <FiPlus className="size-4" />
            {rol === "ADMIN" ? "Agregar administrador" : "Agregar socio"}
          </Button>
        </div>
      )}
      {inactive.length ? (
        <div>
          <button
            type="button"
            onClick={() => setShowInactive((value) => !value)}
            className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-400 hover:text-ink-600"
          >
            {showInactive ? <FiChevronUp className="size-4" /> : <FiChevronDown className="size-4" />}
            Desactivados ({inactive.length})
          </button>
          {showInactive ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {inactive.map((item) => (
                <AccessCard key={item.id} item={item} total={total} onOpen={() => onOpen(item)} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AccessCard({ item, total, onOpen }: { item: CollaboratorView; total: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-200",
        !item.activo && "opacity-70"
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar name={item.nombre} color={item.rol === "SOCIO" ? "#6366f1" : "#0ea5e9"} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-800">{item.nombre}</p>
          <p className="truncate text-xs text-ink-500">{item.email}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", item.activo ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500")}>
          {item.activo ? "Activo" : "Desactivado"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-ink-100 pt-3 text-xs text-ink-500">
        <span>{item.cantidadPermisos == null ? "Acceso de socio" : `${item.cantidadPermisos} de ${total} permisos`}</span>
        <span>{lastAccess(item.ultimoAcceso)}</span>
      </div>
    </button>
  );
}

/** Paso 1 del asistente: el tipo de colaborador. */
function AddWizard({ onClose, onChoose }: { onClose: () => void; onChoose: (choice: "INSTRUCTOR" | CollaboratorRole) => void }) {
  const options = [
    { value: "INSTRUCTOR" as const, title: "Instructor", description: "Dicta clases y le pagas por ellas. No entra al sistema.", icon: FiUserCheck },
    { value: "ADMIN" as const, title: "Administrador", description: "Entra al sistema y ve solo lo que tú elijas.", icon: FiShield },
    { value: "SOCIO" as const, title: "Socio", description: "Entra al sistema y ve todo, menos tu plan.", icon: FiUsers }
  ];
  return (
    <Modal open onClose={onClose} title="Agregar colaborador" description="¿Qué tipo de colaborador es?">
      <div className="space-y-2">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChoose(option.value)}
              className="flex w-full items-start gap-3 rounded-xl border border-ink-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink-800">{option.title}</span>
                <span className="block text-xs text-ink-500">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/** Pasos 2 y 3: datos de acceso y, para el administrador, sus permisos (D4). */
function CollaboratorFormModal({
  rol: initialRol,
  item,
  onClose
}: {
  rol: CollaboratorRole;
  item: CollaboratorView | null;
  onClose: (savedRol?: CollaboratorRole) => void;
}) {
  const request = useStudioRequest();
  const [rol, setRol] = useState<CollaboratorRole>(item?.rol ?? initialRol);
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [email, setEmail] = useState(item?.email ?? "");
  const [celular, setCelular] = useState(item?.celular ?? "");
  const [password, setPassword] = useState("");
  const [permisos, setPermisos] = useState<CollaboratorPermissions>(() => normalizePermissions(item?.permisos ?? { HORARIO: true }));
  const [saving, setSaving] = useState(false);
  const isNew = !item;
  const error =
    nombre.trim().length < 2
      ? "Escribe el nombre"
      : !/^\S+@\S+\.\S+$/.test(email.trim())
        ? "Escribe un correo válido"
        : (isNew || password) && password.length < 8
          ? "La contraseña debe tener al menos 8 caracteres"
          : null;

  function toggle(key: keyof CollaboratorPermissions) {
    if (key === "INICIO") return;
    setPermisos((current) => {
      const next = { ...current, [key]: !current[key] };
      // Quitar "Ver" quita tambien lo que lo incluye.
      if (key === "VER_PAGOS" && !next.VER_PAGOS) next.HACER_PAGOS = false;
      if (key === "VER_AJUSTES" && !next.VER_AJUSTES) next.EDITAR_AJUSTES = false;
      return normalizePermissions(next);
    });
  }

  async function save(activo?: boolean) {
    if (error && activo === undefined) return;
    setSaving(true);
    const body = JSON.stringify({ nombre, email, celular: celular || null, rol, permisos, password: password || null, ...(activo !== undefined ? { activo } : {}) });
    const saved = isNew
      ? await request("/api/collaborators", { method: "POST", body }, rol === "ADMIN" ? "Administrador creado" : "Socio creado")
      : await request(
          `/api/collaborators/${item.id}`,
          { method: "PUT", body },
          activo === false ? "Acceso desactivado" : activo === true ? "Acceso reactivado" : "Cambios guardados"
        );
    setSaving(false);
    if (saved) onClose(rol);
  }

  return (
    <Modal
      open
      onClose={() => (saving ? undefined : onClose())}
      title={isNew ? (rol === "ADMIN" ? "Nuevo administrador" : "Nuevo socio") : item.nombre}
      description={rol === "ADMIN" ? "Entra con su correo y ve solo lo que marques." : "Entra con su correo y ve todo, menos tu plan."}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-ink-50 p-1">
          {(["ADMIN", "SOCIO"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={rol === value}
              onClick={() => setRol(value)}
              className={cn("rounded-lg py-1.5 text-sm font-semibold", rol === value ? "bg-white text-brand-700 shadow-sm" : "text-ink-500")}
            >
              {value === "ADMIN" ? "Administrador" : "Socio"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="col-nombre">
              Nombre
            </label>
            <input id="col-nombre" className={inputClass} value={nombre} onChange={(event) => setNombre(event.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="col-celular">
              Celular <span className="text-ink-400">(opcional)</span>
            </label>
            <input id="col-celular" className={inputClass} inputMode="tel" value={celular} onChange={(event) => setCelular(event.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="col-email">
              Correo para entrar
            </label>
            <input id="col-email" type="email" autoComplete="off" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="col-password">
              Contraseña {isNew ? null : <span className="text-ink-400">(vacía = no cambiarla)</span>}
            </label>
            <input
              id="col-password"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        {rol === "ADMIN" ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink-800">Permisos</p>
            {COLLABORATOR_PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.title} className="rounded-xl border border-ink-200">
                <legend className="ml-3 px-1 text-[10px] font-black uppercase tracking-wide text-ink-400">{group.title}</legend>
                <div className="divide-y divide-ink-100">
                  {group.permissions.map((permission) => (
                    <label key={permission.key} className={cn("flex items-start gap-3 px-3 py-2", permission.key === "INICIO" ? "cursor-default" : "cursor-pointer")}>
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-brand-600"
                        checked={permisos[permission.key]}
                        disabled={permission.key === "INICIO"}
                        onChange={() => toggle(permission.key)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-ink-800">{permission.label}</span>
                        <span className="block text-[11px] text-ink-500">{permission.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <p className="text-[11px] text-ink-500">Mi Plan y los administradores y socios son solo tuyos.</p>
          </div>
        ) : null}

        {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}

        <div className="flex flex-wrap gap-3 pt-1">
          {!isNew ? (
            <Button
              type="button"
              variant="ghost"
              className={cn("rounded-xl px-3", item.activo ? "text-rose-600 hover:bg-rose-50" : "text-brand-700 hover:bg-brand-50")}
              loading={saving}
              onClick={() => save(!item.activo)}
            >
              {item.activo ? "Desactivar acceso" : "Reactivar acceso"}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={() => onClose()}>
            Cancelar
          </Button>
          <Button type="button" className="flex-1 rounded-xl py-2.5 shadow-none" loading={saving} disabled={Boolean(error)} onClick={() => save()}>
            {isNew ? (rol === "ADMIN" ? "Crear administrador" : "Crear socio") : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
