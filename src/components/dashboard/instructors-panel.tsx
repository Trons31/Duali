"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FiAlertCircle, FiPlus, FiSearch, FiUserCheck } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { ColorDot, EmptyCard, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import { payExample, payKind, type InstructorPay, type InstructorVariable, type PayKind } from "@/lib/instructor-pay";
import type { InstructorView } from "@/lib/instructors";
import { DISCIPLINE_COLORS } from "@/lib/studio-constants";
import { cn } from "@/lib/web-utils";
import type { DisciplineItem } from "@/lib/web-types";

type Filter = "activos" | "inactivos";

/**
 * Spec 023 R1/R3: quien da cada clase y como se le paga. Desde la spec 024 vive
 * en la pestaña Instructores de Colaboradores (`embedded`); un administrador con
 * "Ver instructores" lo ve sin editar (`readOnly`).
 */
export function InstructorsPanel({
  instructors,
  disciplines,
  unregistered,
  embedded = false,
  readOnly = false
}: {
  instructors: InstructorView[];
  disciplines: DisciplineItem[];
  unregistered: string[];
  embedded?: boolean;
  readOnly?: boolean;
}) {
  const request = useStudioRequest();
  const [filter, setFilter] = useState<Filter>("activos");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<InstructorView | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const counts = { activos: instructors.filter((item) => item.activo).length, inactivos: instructors.filter((item) => !item.activo).length };
  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("es");
    return instructors.filter(
      (item) =>
        (filter === "activos" ? item.activo : !item.activo) &&
        (!text || `${item.nombreCompleto} ${item.disciplinas.map((discipline) => discipline.nombre).join(" ")}`.toLocaleLowerCase("es").includes(text))
    );
  }, [instructors, filter, query]);

  async function importNames() {
    setImporting(true);
    await request("/api/instructors/import", { method: "POST" }, "Instructores registrados");
    setImporting(false);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {!embedded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Instructores</h1>
            <p className="mt-1 text-sm text-ink-500">Quién da cada clase y cómo se le paga</p>
          </div>
          {!readOnly ? (
            <Button className="w-full rounded-xl px-4 py-2 font-medium shadow-none sm:w-auto" onClick={() => setEditing("new")}>
              <FiPlus className="size-4" />
              Nuevo instructor
            </Button>
          ) : null}
        </div>
      ) : null}

      {unregistered.length && !readOnly ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex gap-2 text-sm text-sky-900">
            <FiUserCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              En tu horario aparecen <strong>{joinNames(unregistered)}</strong>, escritos a mano. Regístralos para asignarles sus clases y
              calcular lo que les pagas.
            </span>
          </p>
          <Button className="shrink-0 rounded-xl px-4 py-2 font-medium shadow-none" loading={importing} onClick={importNames}>
            Registrarlos
          </Button>
        </div>
      ) : null}

      {instructors.length ? (
        <>
          <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-3 shadow-sm sm:p-4">
            <label className="relative block">
              <span className="sr-only">Buscar instructores</span>
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre o disciplina"
                className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-700 placeholder:text-ink-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(["activos", "inactivos"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                    filter === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:bg-ink-50"
                  )}
                >
                  {value} <span className="text-ink-400">{counts[value]}</span>
                </button>
              ))}
            </div>
          </div>

          {visible.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => (
                <InstructorCard key={item.id} item={item} onOpen={readOnly ? undefined : () => setEditing(item)} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-500">No hay instructores con ese filtro.</p>
          )}
        </>
      ) : (
        <EmptyCard
          title="Aún no tienes instructores"
          description="Regístralos con las disciplinas que dan y cómo les pagas. Después los eliges en el horario y Duali calcula lo que les debes."
          action={
            readOnly ? null : (
              <Button className="rounded-xl px-4 py-2 font-medium shadow-none" onClick={() => setEditing("new")}>
                <FiPlus className="size-4" />
                Nuevo instructor
              </Button>
            )
          }
        />
      )}

      {editing ? (
        <InstructorFormModal
          key={editing === "new" ? "new" : editing.id}
          instructor={editing === "new" ? null : editing}
          disciplines={disciplines}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length > 4) return `${names.slice(0, 3).join(", ")} y ${names.length - 3} más`;
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

function InstructorCard({ item, onOpen }: { item: InstructorView; onOpen?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-sm transition enabled:hover:border-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-default"
    >
      <div className="flex items-center gap-3">
        <Avatar name={item.nombre} color={item.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-800">{item.nombreCompleto}</p>
          <p className="text-xs text-ink-500">{item.celular ?? "Sin celular"}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
            item.activo ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500"
          )}
        >
          {item.activo ? "Activo" : "Inactivo"}
        </span>
      </div>
      {item.disciplinas.length ? (
        <div className="flex flex-wrap gap-1.5">
          {item.disciplinas.map((discipline) => (
            <span key={discipline.id} className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2 py-0.5 text-xs text-ink-600">
              <ColorDot color={discipline.color} className="size-2" />
              {discipline.nombre}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-400">Sin disciplinas asignadas</p>
      )}
      <div className="border-t border-ink-100 pt-3">
        {item.pagoConfigurado ? (
          <p className="text-sm font-medium text-ink-700">{item.descripcionPago}</p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700">
            <FiAlertCircle className="size-4" />
            {item.descripcionPago}
          </p>
        )}
        <p className="mt-0.5 text-xs text-ink-500">
          {item.horarios ? `Titular de ${item.horarios} horario${item.horarios === 1 ? "" : "s"} fijo${item.horarios === 1 ? "" : "s"}` : "Sin horarios asignados"}
        </p>
      </div>
    </button>
  );
}

export function Avatar({ name, color, size = "md" }: { name: string; color: string; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-bold text-white",
        size === "lg" ? "size-12 text-lg" : "size-10 text-sm"
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const KINDS: Array<{ value: PayKind; label: string; help: string }> = [
  { value: "SUELDO", label: "Sueldo fijo", help: "Un valor por ciclo de sueldos" },
  { value: "POR_CLASE", label: "Por clase dictada", help: "Un valor por cada clase" },
  { value: "POR_ALUMNO", label: "Por alumno", help: "Por cada alumno que asiste" },
  { value: "SUELDO_VARIABLE", label: "Sueldo + variable", help: "Sueldo base y además una variable" }
];

const VARIABLE_OPTIONS: Array<{ value: InstructorVariable; label: string }> = [
  { value: "POR_CLASE", label: "Por clase" },
  { value: "ALUMNO_FIJO", label: "Por alumno · valor fijo" },
  { value: "ALUMNO_PORCENTAJE", label: "Por alumno · %" }
];

type FormState = {
  nombre: string;
  apellido: string;
  celular: string;
  email: string;
  color: string;
  notas: string;
  activo: boolean;
  kind: PayKind;
  /** Con POR_ALUMNO: valor fijo o porcentaje. */
  alumnoModo: "FIJO" | "PORCENTAJE";
  /** Con SUELDO_VARIABLE: cual variable. */
  variableMixta: InstructorVariable;
  sueldo: string;
  valor: string;
  minimoPorClase: string;
  alumnosMinimos: string;
  disciplinas: Record<string, { selected: boolean; valor: string }>;
};

function initialState(instructor: InstructorView | null, disciplines: DisciplineItem[]): FormState {
  const pay = instructor?.pago;
  const kind = pay && instructor?.pagoConfigurado ? payKind(pay) : "POR_ALUMNO";
  const own = new Map(instructor?.disciplinas.map((item) => [item.id, item.valor]) ?? []);
  return {
    nombre: instructor?.nombre ?? "",
    apellido: instructor?.apellido ?? "",
    celular: instructor?.celular ?? "",
    email: instructor?.email ?? "",
    color: instructor?.color ?? DISCIPLINE_COLORS[1],
    notas: instructor?.notas ?? "",
    activo: instructor?.activo ?? true,
    kind,
    alumnoModo: pay?.variable === "ALUMNO_PORCENTAJE" ? "PORCENTAJE" : "FIJO",
    variableMixta: pay?.variable ?? "ALUMNO_FIJO",
    sueldo: pay?.sueldo != null ? String(pay.sueldo) : "",
    valor: pay?.valor != null ? String(pay.valor) : "",
    minimoPorClase: pay?.minimoPorClase != null ? String(pay.minimoPorClase) : "",
    alumnosMinimos: String(pay?.alumnosMinimos ?? 1),
    disciplinas: Object.fromEntries(
      disciplines.map((discipline) => [
        discipline.id,
        { selected: own.has(discipline.id), valor: own.get(discipline.id) != null ? String(own.get(discipline.id)) : "" }
      ])
    )
  };
}

/** De lo que eligio el formulario a la forma de pago (D1). */
function toPay(state: FormState): InstructorPay {
  const variable: InstructorVariable | null =
    state.kind === "SUELDO"
      ? null
      : state.kind === "POR_CLASE"
        ? "POR_CLASE"
        : state.kind === "POR_ALUMNO"
          ? state.alumnoModo === "PORCENTAJE"
            ? "ALUMNO_PORCENTAJE"
            : "ALUMNO_FIJO"
          : state.variableMixta;
  const hasSueldo = state.kind === "SUELDO" || state.kind === "SUELDO_VARIABLE";
  return {
    sueldo: hasSueldo ? Number(state.sueldo || 0) : null,
    variable,
    valor: variable ? Number(state.valor || 0) : null,
    minimoPorClase: variable && variable !== "POR_CLASE" && state.minimoPorClase ? Number(state.minimoPorClase) : null,
    alumnosMinimos: Math.max(1, Number(state.alumnosMinimos || 1))
  };
}

/** Spec 023 R1/R2: datos, disciplinas y forma de pago, con el ejemplo en vivo. */
export function InstructorFormModal({
  instructor,
  disciplines,
  onClose
}: {
  instructor: InstructorView | null;
  disciplines: DisciplineItem[];
  onClose: () => void;
}) {
  const request = useStudioRequest();
  const [state, setState] = useState(() => initialState(instructor, disciplines));
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((current) => ({ ...current, [key]: value }));

  const pay = toPay(state);
  const percent = pay.variable === "ALUMNO_PORCENTAJE";
  const selected = disciplines.filter((discipline) => state.disciplinas[discipline.id]?.selected);
  const example = payExample(pay);

  function validate() {
    if (state.nombre.trim().length < 2) return "Escribe el nombre";
    if (pay.sueldo != null && pay.sueldo <= 0) return "Escribe el sueldo";
    if (pay.variable && !(pay.valor && pay.valor > 0)) return percent ? "Escribe el porcentaje" : "Escribe el valor";
    if (percent && (pay.valor ?? 0) > 100) return "El porcentaje no puede pasar de 100";
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) return setError(problem);
    setError(null);
    setSaving(true);
    const body = {
      nombre: state.nombre.trim(),
      apellido: state.apellido.trim() || null,
      celular: state.celular.trim() || null,
      email: state.email.trim() || null,
      color: state.color,
      notas: state.notas.trim() || null,
      ...(instructor ? { activo: state.activo } : {}),
      ...pay,
      disciplinas: selected.map((discipline) => ({
        disciplineId: discipline.id,
        valor: pay.variable && state.disciplinas[discipline.id].valor ? Number(state.disciplinas[discipline.id].valor) : null
      }))
    };
    const saved = await request(
      instructor ? `/api/instructors/${instructor.id}` : "/api/instructors",
      { method: instructor ? "PUT" : "POST", body: JSON.stringify(body) },
      instructor ? "Instructor actualizado" : "Instructor creado"
    );
    setSaving(false);
    if (saved) onClose();
  }

  async function remove() {
    if (!instructor) return;
    setSaving(true);
    const done = await request(`/api/instructors/${instructor.id}`, { method: "DELETE" }, instructor.horarios ? "Instructor desactivado" : "Instructor eliminado");
    setSaving(false);
    if (done) onClose();
  }

  const valueInput = (value: string, onChange: (value: string) => void, label: string) =>
    percent ? (
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.5"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className={cn(inputClass, "pr-8")}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">%</span>
      </div>
    ) : (
      <MoneyInput value={value} onChange={onChange} className="h-[42px] rounded-xl py-2.5 text-sm" aria-label={label} />
    );

  return (
    <Modal
      size="lg"
      open
      onClose={() => (saving ? undefined : onClose())}
      title={instructor ? "Editar instructor" : "Nuevo instructor"}
      description="Sus datos, las disciplinas que da y cómo le pagas."
    >
      <div className="space-y-6">
        <FormSection title="Datos">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="instructor-nombre">
              <input id="instructor-nombre" className={inputClass} value={state.nombre} onChange={(event) => set("nombre", event.target.value)} />
            </Field>
            <Field label="Apellido" optional htmlFor="instructor-apellido">
              <input id="instructor-apellido" className={inputClass} value={state.apellido} onChange={(event) => set("apellido", event.target.value)} />
            </Field>
            <Field label="Celular" optional htmlFor="instructor-celular">
              <input
                id="instructor-celular"
                type="tel"
                inputMode="tel"
                placeholder="300 000 0000"
                className={inputClass}
                value={state.celular}
                onChange={(event) => set("celular", event.target.value)}
              />
            </Field>
            <Field label="Correo" optional htmlFor="instructor-email">
              <input id="instructor-email" type="email" className={inputClass} value={state.email} onChange={(event) => set("email", event.target.value)} />
            </Field>
          </div>
          <div>
            <span className={labelClass}>Color</span>
            <div className="flex flex-wrap gap-2">
              {DISCIPLINE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  aria-pressed={state.color === color}
                  onClick={() => set("color", color)}
                  className={cn("size-8 rounded-full ring-offset-2 transition", state.color === color && "ring-2 ring-ink-800")}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </FormSection>

        <FormSection title="Disciplinas que da">
          {disciplines.length ? (
            <div className="flex flex-wrap gap-2">
              {disciplines.map((discipline) => {
                const on = state.disciplinas[discipline.id]?.selected;
                return (
                  <button
                    key={discipline.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set("disciplinas", { ...state.disciplinas, [discipline.id]: { ...state.disciplinas[discipline.id], selected: !on } })
                    }
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all",
                      on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
                    )}
                  >
                    <ColorDot color={discipline.color} className="size-2.5" />
                    {discipline.nombre}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-ink-500">Aún no tienes disciplinas de clase. Créalas en Paquetes y precios.</p>
          )}
        </FormSection>

        <FormSection title="¿Cómo le pagas?">
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
            {KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                role="radio"
                aria-checked={state.kind === kind.value}
                onClick={() => set("kind", kind.value)}
                className={cn(
                  "rounded-xl border-2 px-3 py-2.5 text-left transition",
                  state.kind === kind.value ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300"
                )}
              >
                <span className="block text-sm font-semibold text-ink-800">{kind.label}</span>
                <span className="block text-xs text-ink-500">{kind.help}</span>
              </button>
            ))}
          </div>

          {state.kind === "POR_ALUMNO" ? (
            <Segmented
              label="Por alumno"
              value={state.alumnoModo}
              options={[
                { value: "FIJO", label: "Valor fijo" },
                { value: "PORCENTAJE", label: "% de su clase" }
              ]}
              onChange={(value) => set("alumnoModo", value)}
            />
          ) : null}
          {state.kind === "SUELDO_VARIABLE" ? (
            <Segmented label="Además del sueldo" value={state.variableMixta} options={VARIABLE_OPTIONS} onChange={(value) => set("variableMixta", value)} />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {pay.sueldo != null ? (
              <Field label="Sueldo por ciclo de sueldos">
                <MoneyInput value={state.sueldo} onChange={(value) => set("sueldo", value)} className="h-[42px] rounded-xl py-2.5 text-sm" aria-label="Sueldo" />
              </Field>
            ) : null}
            {pay.variable ? (
              <Field label={pay.variable === "POR_CLASE" ? "Valor por clase" : percent ? "Porcentaje de la clase de cada alumno" : "Valor por alumno"}>
                {valueInput(state.valor, (value) => set("valor", value), "Valor")}
              </Field>
            ) : null}
            {pay.variable && pay.variable !== "POR_CLASE" ? (
              <Field label="Mínimo por clase" optional>
                <MoneyInput
                  value={state.minimoPorClase}
                  onChange={(value) => set("minimoPorClase", value)}
                  className="h-[42px] rounded-xl py-2.5 text-sm"
                  aria-label="Mínimo por clase"
                />
              </Field>
            ) : null}
            {pay.variable ? (
              <Field label="Paga desde (alumnos)" htmlFor="instructor-minimos">
                <input
                  id="instructor-minimos"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  className={inputClass}
                  value={state.alumnosMinimos}
                  onChange={(event) => set("alumnosMinimos", event.target.value)}
                />
              </Field>
            ) : null}
          </div>

          {pay.variable && selected.length ? (
            <details className="rounded-xl border border-ink-200 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-ink-700">Valor distinto por disciplina</summary>
              <div className="mt-3 space-y-2">
                {selected.map((discipline) => (
                  <div key={discipline.id} className="grid grid-cols-[1fr_10rem] items-center gap-3">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-700">
                      <ColorDot color={discipline.color} className="size-2.5" />
                      <span className="truncate">{discipline.nombre}</span>
                    </span>
                    {valueInput(
                      state.disciplinas[discipline.id].valor,
                      (value) => set("disciplinas", { ...state.disciplinas, [discipline.id]: { ...state.disciplinas[discipline.id], valor: value } }),
                      `Valor en ${discipline.nombre}`
                    )}
                  </div>
                ))}
                <p className="text-[11px] text-ink-400">Vacío = usa el valor general.</p>
              </div>
            </details>
          ) : null}

          <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-900">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Ejemplo</p>
            {example.map((line) => (
              <p key={line} className="mt-0.5">
                {line}
              </p>
            ))}
          </div>
        </FormSection>

        <FormSection title="Notas" optional>
          <textarea className={`${inputClass} min-h-16 resize-none`} value={state.notas} onChange={(event) => set("notas", event.target.value)} />
          {instructor ? (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" className="size-4 accent-brand-600" checked={state.activo} onChange={(event) => set("activo", event.target.checked)} />
              Activo (se puede asignar a clases)
            </label>
          ) : null}
        </FormSection>

        {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

        <div className="flex flex-wrap gap-3 border-t border-ink-100 pt-4">
          {instructor ? (
            <Button variant="ghost" className="rounded-xl px-3 py-2.5 text-rose-600 hover:bg-rose-50" onClick={() => setConfirmRemove(true)}>
              {instructor.horarios ? "Desactivar" : "Eliminar"}
            </Button>
          ) : null}
          <div className="ml-auto flex flex-1 gap-3 sm:flex-none">
            <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5 sm:w-32" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1 rounded-xl py-2.5 shadow-none sm:w-44" loading={saving} onClick={submit}>
              {instructor ? "Guardar" : "Crear instructor"}
            </Button>
          </div>
        </div>
      </div>

      {instructor ? (
        <ConfirmDialog
          open={confirmRemove}
          title={instructor.horarios ? "Desactivar instructor" : "Eliminar instructor"}
          description={instructor.nombreCompleto}
          notice={
            instructor.horarios
              ? `Es titular de ${instructor.horarios} horario${instructor.horarios === 1 ? "" : "s"}: queda inactivo y conserva su historia. Asigna esas clases a otra persona en el Horario.`
              : "No tiene clases asignadas, así que se borra."
          }
          loading={saving}
          onClose={() => setConfirmRemove(false)}
          onConfirm={remove}
        />
      ) : null}
    </Modal>
  );
}

function FormSection({ title, optional, children }: { title: string; optional?: boolean; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400">
        {title} {optional ? <span className="font-normal normal-case tracking-normal">(opcional)</span> : null}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, optional, htmlFor, children }: { label: string; optional?: boolean; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label className={labelClass} htmlFor={htmlFor}>
        {label} {optional ? <span className="text-ink-400">(opcional)</span> : null}
      </label>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              value === option.value ? "bg-white text-ink-900 shadow-sm ring-1 ring-black/5" : "text-ink-500 hover:text-ink-700"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
