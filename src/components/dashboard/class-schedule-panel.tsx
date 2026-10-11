"use client";

import { SelectField } from "@/components/ui/select-field";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { FiChevronLeft, FiChevronRight, FiPlus, FiTrash2, FiUsers } from "react-icons/fi";
import { AttendancePanel } from "@/components/dashboard/attendance-panel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { ClassSessionModal } from "@/components/dashboard/class-session-modal";
import { InstructorSelect, type InstructorOption } from "@/components/dashboard/instructor-select";
import { ColorDot, EmptyCard, ToggleRow, inputClass, labelClass, useStudioRequest } from "@/components/dashboard/studio-ui";
import {
  WEEKDAYS,
  addDaysToKey,
  addMinutesToTimeKey,
  dateKeyToDate,
  eachDateKey,
  formatTimeKey,
  isoWeekday
} from "@/lib/studio-time";
import { cn } from "@/lib/web-utils";
import type { ClassScheduleItem, ClassSessionItem, DisciplineItem } from "@/lib/web-types";

type View = "semana" | "asistencia" | "horarios";

const DURATIONS = [30, 45, 60, 75, 90, 120];

function formatDateKey(key: string, options: Intl.DateTimeFormatOptions) {
  // Las fechas son "de pared": se formatean en UTC para que no se corra el dia.
  return new Intl.DateTimeFormat("es-CO", { ...options, timeZone: "UTC" }).format(dateKeyToDate(key));
}

function weekLabel(weekStart: string) {
  const weekEnd = addDaysToKey(weekStart, 6);
  const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7);
  const from = formatDateKey(weekStart, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  return `${from} – ${formatDateKey(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`;
}

/**
 * Horario de clases del estudio (spec 005). La semana se navega por URL para
 * que el servidor traiga las clases de esas fechas; las pestañas son locales.
 */
export function ClassSchedulePanel({
  today,
  weekStart,
  initialView,
  attendanceDate,
  sessions,
  schedules,
  disciplines,
  instructors
}: {
  today: string;
  weekStart: string;
  initialView: View;
  attendanceDate?: string;
  sessions: ClassSessionItem[];
  schedules: ClassScheduleItem[];
  disciplines: DisciplineItem[];
  instructors: InstructorOption[];
}) {
  const [view, setView] = useState<View>(initialView);
  const [selectedSession, setSelectedSession] = useState<ClassSessionItem | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{ item?: ClassScheduleItem } | null>(null);

  const days = eachDateKey(weekStart, addDaysToKey(weekStart, 6));
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, ClassSessionItem[]>();
    for (const session of sessions) map.set(session.fecha, [...(map.get(session.fecha) ?? []), session]);
    return map;
  }, [sessions]);

  const openSchedule = (scheduleId: string) => {
    const item = schedules.find((schedule) => schedule.id === scheduleId);
    if (item) setScheduleModal({ item });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Horario de clases</h1>
          <p className="mt-1 text-sm text-ink-500">Tus clases de la semana y sus cupos</p>
        </div>
        <Button
          className="w-full rounded-xl px-4 py-2 font-medium shadow-none sm:w-auto"
          disabled={!disciplines.length}
          title={!disciplines.length ? "Primero crea una disciplina en Paquetes" : undefined}
          onClick={() => setScheduleModal({})}
        >
          <FiPlus className="size-4" />
          Nuevo horario
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex self-start rounded-xl border border-ink-200 bg-white p-1 shadow-sm" role="tablist">
          {(
            [
              ["semana", "Semana"],
              ["asistencia", "Asistencia"],
              ["horarios", "Horarios fijos"]
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                view === value ? "bg-brand-500 text-white shadow-sm" : "text-ink-600 hover:bg-ink-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "semana" ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/horario?semana=${addDaysToKey(weekStart, -7)}`}
              className="flex size-9 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              aria-label="Semana anterior"
            >
              <FiChevronLeft className="size-4" />
            </Link>
            <span className="min-w-0 flex-1 text-center text-sm font-semibold text-ink-800 sm:min-w-44 sm:flex-none">
              {weekLabel(weekStart)}
            </span>
            <Link
              href={`/dashboard/horario?semana=${addDaysToKey(weekStart, 7)}`}
              className="flex size-9 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              aria-label="Semana siguiente"
            >
              <FiChevronRight className="size-4" />
            </Link>
            {!days.includes(today) ? (
              <Link
                href="/dashboard/horario"
                className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-ink-600 hover:bg-ink-50"
              >
                Hoy
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {view === "asistencia" ? (
        // Spec 019 D5: la asistencia se toma donde ocurre la clase.
        <AttendancePanel today={today} initialDate={attendanceDate} />
      ) : !schedules.length && !sessions.length ? (
        <EmptyCard
          title={disciplines.length ? "Aún no tienes horarios" : "Primero crea tus disciplinas"}
          description={
            disciplines.length
              ? "Crea un horario fijo (ej. Body Combat lunes, miércoles y viernes a las 6 p. m.) y se repetirá cada semana."
              : "El horario se arma con las disciplinas que creas en Paquetes → Disciplinas."
          }
          action={
            disciplines.length ? (
              <Button className="rounded-xl px-4 py-2 font-medium shadow-none" onClick={() => setScheduleModal({})}>
                <FiPlus className="size-4" />
                Nuevo horario
              </Button>
            ) : (
              <Link
                href="/dashboard/paquetes"
                className="inline-flex items-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Ir a Paquetes
              </Link>
            )
          }
        />
      ) : view === "semana" ? (
        <div className="grid gap-3 lg:grid-cols-7 lg:gap-2">
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              isToday={day === today}
              isPast={day < today}
              sessions={sessionsByDay.get(day) ?? []}
              onSelect={setSelectedSession}
            />
          ))}
        </div>
      ) : (
        <FixedSchedules schedules={schedules} onSelect={(item) => setScheduleModal({ item })} />
      )}

      {selectedSession ? (
        <ClassSessionModal
          key={selectedSession.key}
          session={selectedSession}
          today={today}
          instructors={instructors}
          canEditSchedule={schedules.some((schedule) => schedule.id === selectedSession.scheduleId)}
          onEditSchedule={() => {
            const scheduleId = selectedSession.scheduleId;
            setSelectedSession(null);
            openSchedule(scheduleId);
          }}
          onClose={() => setSelectedSession(null)}
        />
      ) : null}

      {scheduleModal ? (
        <ScheduleModal
          key={scheduleModal.item?.id ?? "new"}
          item={scheduleModal.item}
          disciplines={disciplines}
          instructors={instructors}
          onClose={() => setScheduleModal(null)}
        />
      ) : null}
    </div>
  );
}

function DayColumn({
  day,
  isToday,
  isPast,
  sessions,
  onSelect
}: {
  day: string;
  isToday: boolean;
  isPast: boolean;
  sessions: ClassSessionItem[];
  onSelect: (session: ClassSessionItem) => void;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-white p-3 shadow-sm",
        isToday ? "border-brand-300 ring-1 ring-brand-200" : "border-ink-200"
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 lg:flex-col lg:items-start lg:gap-0">
        <p className={cn("text-xs font-semibold uppercase tracking-wide", isToday ? "text-brand-600" : "text-ink-400")}>
          {WEEKDAYS[isoWeekday(day) - 1].short}
          {isToday ? " · Hoy" : ""}
        </p>
        <p className="text-sm font-bold text-ink-800">{formatDateKey(day, { day: "numeric", month: "short" })}</p>
      </div>
      <div className="space-y-1.5">
        {sessions.map((session) => (
          <SessionChip key={session.key} session={session} isPast={isPast} onClick={() => onSelect(session)} />
        ))}
        {!sessions.length ? <p className="py-1 text-xs text-ink-300">Sin clases</p> : null}
      </div>
    </section>
  );
}

function SessionChip({ session, isPast, onClick }: { session: ClassSessionItem; isPast: boolean; onClick: () => void }) {
  const full = session.reservadas >= session.cupo;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border border-ink-100 border-l-4 bg-ink-50/50 px-2.5 py-1.5 text-left transition hover:bg-ink-50",
        (isPast || session.cancelada) && "opacity-60"
      )}
      style={{ borderLeftColor: session.discipline.color }}
    >
      <p className={cn("text-[11px] font-medium text-ink-500", session.cancelada && "line-through")}>
        {formatTimeKey(session.horaInicio)}
      </p>
      <p className={cn("truncate text-xs font-semibold text-ink-800", session.cancelada && "line-through")}>
        {session.discipline.nombre}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
        {session.cancelada ? (
          <span className="font-semibold text-rose-600">Cancelada</span>
        ) : (
          <>
            <FiUsers className="size-3" />
            <span className={cn(full && "font-semibold text-amber-600")}>
              {session.reservadas}/{session.cupo}
            </span>
          </>
        )}
      </p>
    </button>
  );
}

function FixedSchedules({
  schedules,
  onSelect
}: {
  schedules: ClassScheduleItem[];
  onSelect: (item: ClassScheduleItem) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {WEEKDAYS.map((weekday) => {
        const items = schedules.filter((schedule) => schedule.diaSemana === weekday.value);
        return (
          <section key={weekday.value} className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-ink-800">{weekday.label}</h2>
            <ul className="mt-2 divide-y divide-ink-100">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition hover:bg-ink-50",
                      !item.activo && "opacity-60"
                    )}
                  >
                    <ColorDot color={item.discipline.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-800">{item.discipline.nombre}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatTimeKey(item.horaInicio)} – {formatTimeKey(addMinutesToTimeKey(item.horaInicio, item.duracionMin))}
                        {item.instructor ? ` · ${item.instructor}` : ""}
                      </p>
                    </div>
                    {item.activo ? (
                      <span className="shrink-0 text-xs font-medium text-ink-500">{item.cupo} cupos</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">
                        Pausado
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {!items.length ? <li className="py-2 text-xs text-ink-300">Sin clases</li> : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

type ScheduleFormValues = {
  disciplineId: string;
  dias: number[];
  horaInicio: string;
  duracionMin: string;
  cupo: string;
  /** Id del titular, TEXTO_PROPIO (el nombre escrito a mano que ya tenia) o "" sin asignar. */
  instructorId: string;
  activo: boolean;
};

const OWN_TEXT = "TEXTO_PROPIO";

function ScheduleModal({
  item,
  disciplines,
  instructors,
  onClose
}: {
  item?: ClassScheduleItem;
  disciplines: DisciplineItem[];
  instructors: InstructorOption[];
  onClose: () => void;
}) {
  const request = useStudioRequest();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEditing = Boolean(item);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting, errors }
  } = useForm<ScheduleFormValues>({
    defaultValues: {
      disciplineId: item?.disciplineId ?? disciplines[0]?.id ?? "",
      dias: item ? [item.diaSemana] : [],
      horaInicio: item?.horaInicio ?? "18:00",
      duracionMin: String(item?.duracionMin ?? 60),
      cupo: String(item?.cupo ?? 15),
      instructorId: item?.instructorId ?? (item?.instructor ? OWN_TEXT : ""),
      activo: item?.activo ?? true
    }
  });
  const disciplineId = watch("disciplineId");
  const dias = watch("dias");
  // Al editar se puede ver una disciplina ya inactiva; se agrega para no perderla.
  const options =
    item && !disciplines.some((discipline) => discipline.id === item.disciplineId)
      ? [...disciplines, { ...item.discipline } as DisciplineItem]
      : disciplines;

  function toggleDay(value: number) {
    if (isEditing) return setValue("dias", [value], { shouldValidate: true });
    setValue("dias", dias.includes(value) ? dias.filter((day) => day !== value) : [...dias, value].sort(), {
      shouldValidate: true
    });
  }

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      disciplineId: values.disciplineId,
      horaInicio: values.horaInicio,
      duracionMin: Number(values.duracionMin),
      cupo: Number(values.cupo),
      // Spec 023 D5: el servidor copia el nombre del titular al texto del horario.
      ...(values.instructorId === OWN_TEXT
        ? {}
        : { instructorId: values.instructorId || null, instructor: null })
    };

    const saved = isEditing
      ? await request(
          `/api/class-schedules/${item!.id}`,
          { method: "PUT", body: JSON.stringify({ ...payload, diaSemana: values.dias[0], activo: values.activo }) },
          "Horario actualizado"
        )
      : await request(
          "/api/class-schedules",
          { method: "POST", body: JSON.stringify({ ...payload, dias: values.dias }) },
          values.dias.length > 1 ? `${values.dias.length} horarios creados` : "Horario creado"
        );

    if (saved) onClose();
  });

  async function handleDelete() {
    setDeleting(true);
    const deleted = await request(`/api/class-schedules/${item!.id}`, { method: "DELETE" }, "Horario eliminado");
    setDeleting(false);
    if (deleted) onClose();
  }

  return (
    <>
      <Modal
        open
        onClose={() => (isSubmitting ? undefined : onClose())}
        title={isEditing ? "Editar horario fijo" : "Nuevo horario"}
        description={
          isEditing
            ? "Los cambios aplican a las próximas clases. Las fechas que ya ajustaste o cancelaste se conservan."
            : "Se repite cada semana. Si eliges varios días se crea un horario por día."
        }
      >
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <span className={labelClass}>Disciplina</span>
            <div className="flex flex-wrap gap-2">
              {options.map((discipline) => (
                <button
                  key={discipline.id}
                  type="button"
                  aria-pressed={disciplineId === discipline.id}
                  onClick={() => setValue("disciplineId", discipline.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                    disciplineId === discipline.id
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 text-ink-600 hover:border-ink-300"
                  )}
                >
                  <ColorDot color={discipline.color} className="size-2.5" />
                  {discipline.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={labelClass}>{isEditing ? "Día" : "Días"}</span>
            <input type="hidden" {...register("dias", { validate: (value) => value.length > 0 || "Elige al menos un día" })} />
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((weekday) => {
                const selected = dias.includes(weekday.value);
                return (
                  <button
                    key={weekday.value}
                    type="button"
                    aria-pressed={selected}
                    aria-label={weekday.label}
                    onClick={() => toggleDay(weekday.value)}
                    className={cn(
                      "rounded-xl border py-2 text-xs font-semibold transition-all",
                      selected ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
                    )}
                  >
                    {weekday.short}
                  </button>
                );
              })}
            </div>
            {errors.dias ? <p className="mt-1 text-xs font-medium text-rose-600">{errors.dias.message}</p> : null}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass} htmlFor="schedule-hora">
                Hora
              </label>
              <input id="schedule-hora" type="time" className={inputClass} {...register("horaInicio", { required: true })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="schedule-duracion">
                Duración
              </label>
              <SelectField id="schedule-duracion" {...register("duracionMin")}>
                {DURATIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </SelectField>
            </div>
            <div>
              <label className={labelClass} htmlFor="schedule-cupo">
                Cupos
              </label>
              <input
                id="schedule-cupo"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                className={inputClass}
                {...register("cupo", { required: true, min: 1, max: 500 })}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="schedule-instructor">
              Instructor titular <span className="text-ink-400">(opcional)</span>
            </label>
            <InstructorSelect
              id="schedule-instructor"
              value={watch("instructorId")}
              onChange={(value) => setValue("instructorId", value)}
              instructors={instructors}
              disciplineId={disciplineId}
              emptyLabel="Sin asignar"
              extraOption={
                item?.instructor && !item.instructorId ? { value: OWN_TEXT, label: `${item.instructor} (sin registrar)` } : null
              }
            />
            {!instructors.length ? (
              <p className="mt-1 text-[11px] text-ink-400">
                Registra a tu equipo en{" "}
                <Link href="/dashboard/colaboradores" className="font-medium text-brand-600 hover:underline">
                  Colaboradores
                </Link>{" "}
                para elegirlo aquí.
              </p>
            ) : null}
          </div>

          {isEditing ? (
            <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
              <ToggleRow label="Activo" checked={watch("activo")} onChange={(value) => setValue("activo", value)} />
              <p className="mt-1 text-[11px] text-ink-400">Pausado: deja de aparecer en las próximas semanas.</p>
            </div>
          ) : null}

          <div className="flex gap-3 pt-1">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl px-3 text-rose-600 hover:bg-rose-50"
                onClick={() => setConfirmDelete(true)}
                aria-label="Eliminar horario"
              >
                <FiTrash2 className="size-4" />
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="flex-1 rounded-xl py-2.5" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 rounded-xl py-2.5 shadow-none" loading={isSubmitting}>
              {isEditing ? "Guardar" : "Crear horario"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar horario"
        description={`Eliminarás ${item?.discipline.nombre} de los ${
          item ? WEEKDAYS[item.diaSemana - 1].label.toLowerCase() : ""
        } a las ${item ? formatTimeKey(item.horaInicio) : ""}.`}
        notice="Las clases pasadas y las fechas ya ajustadas se conservan. Si solo es temporal, pausa el horario."
        loading={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}
