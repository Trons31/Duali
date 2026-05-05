"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiChevronLeft,
  FiEdit2,
  FiPlus,
  FiSearch,
  FiUsers
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency } from "@/lib/web-utils";
import type { GroupDetailResponse, GroupDetailStudent, PaymentStatus } from "@/lib/web-types";

type StudentPaymentFilter = "todos" | "pendientes" | "pagados" | "vencidos";

type GroupFormValues = {
  nombre: string;
  descripcion?: string;
};

type StudentFormValues = {
  tipoRegistro: "NUEVO" | "ANTIGUO";
  pagoMesActual: "SI" | "NO";
  inscripcionPagada: "SI" | "NO";
  inscripcionMonto: string;
  inscripcionMetodoPago: string;
  modalidadMensualidad: "ANTICIPADA" | "VENCIDA";
  nombre: string;
  apellido: string;
  edad: string;
  celular: string;
  nombrePadre: string;
  telefonoPadre: string;
  parentesco: string;
  diaCobro: string;
  precioMensualidad: string;
};

const FILTER_OPTIONS: Array<{ label: string; value: StudentPaymentFilter }> = [
  { label: "Todos", value: "todos" },
  { label: "Pendientes", value: "pendientes" },
  { label: "Pagados", value: "pagados" },
  { label: "Vencidos", value: "vencidos" }
];

const PAYMENT_METHODS = [
  { label: "Efectivo", value: "EFECTIVO" },
  { label: "Transferencia", value: "TRANSFERENCIA" },
  { label: "Nequi", value: "NEQUI" },
  { label: "Daviplata", value: "DAVIPLATA" }
];

export function GroupDetailPanel({ group }: { group: GroupDetailResponse }) {
  const { data: session } = useSession();
  const router = useRouter();
  const token = session?.user.apiToken ?? "";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StudentPaymentFilter>("todos");
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);

  const {
    register: registerGroup,
    handleSubmit: handleSubmitGroup,
    reset: resetGroup,
    formState: { isSubmitting: isSavingGroup, errors: groupErrors }
  } = useForm<GroupFormValues>({
    defaultValues: {
      nombre: group.nombre,
      descripcion: group.descripcion ?? ""
    }
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting, errors }
  } = useForm<StudentFormValues>({
    defaultValues: createStudentDefaults()
  });

  const registrationType = watch("tipoRegistro");
  const enrollmentPaid = watch("inscripcionPagada");
  const billingMode = watch("modalidadMensualidad");
  const age = Number(watch("edad") || 0);
  const isMinor = age > 0 && age < 18;

  const summary = useMemo(() => {
    const activeStudents = group.students.filter((student) => student.estado === "ACTIVO");
    const studentsWithMonthlyFee = activeStudents.filter((student) => Number(student.precioMensualidad ?? 0) > 0);
    const estimatedIncome = studentsWithMonthlyFee.reduce((sum, student) => sum + Number(student.precioMensualidad ?? 0), 0);
    const pendingCount = activeStudents.filter((student) => currentPayment(student)?.estado === "PENDIENTE").length;
    const overdueCount = activeStudents.filter((student) => currentPayment(student)?.estado === "VENCIDO").length;

    return {
      estimatedIncome,
      studentsWithMonthlyFee: studentsWithMonthlyFee.length,
      activeStudents: activeStudents.length,
      pendingCount,
      overdueCount
    };
  }, [group.students]);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return group.students.filter((student) => {
      const matchesQuery =
        !normalizedQuery ||
        `${student.nombre} ${student.apellido}`.toLowerCase().includes(normalizedQuery) ||
        (student.celular ?? "").toLowerCase().includes(normalizedQuery) ||
        (student.telefonoPadre ?? "").toLowerCase().includes(normalizedQuery);

      if (!matchesQuery) return false;

      const payment = currentPayment(student);
      if (filter === "pagados") return payment?.estado === "PAGADO";
      if (filter === "vencidos") return payment?.estado === "VENCIDO";
      if (filter === "pendientes") return payment?.estado === "PENDIENTE" || payment?.estado === "VENCIDO";
      return true;
    });
  }, [filter, group.students, query]);

  function openAddStudentModal() {
    reset(createStudentDefaults());
    setAddStudentOpen(true);
  }

  function closeAddStudentModal() {
    if (isSubmitting) return;
    setAddStudentOpen(false);
    reset(createStudentDefaults());
  }

  function openEditGroupModal() {
    resetGroup({
      nombre: group.nombre,
      descripcion: group.descripcion ?? ""
    });
    setEditGroupOpen(true);
  }

  function closeEditGroupModal() {
    if (isSavingGroup) return;
    setEditGroupOpen(false);
    resetGroup({
      nombre: group.nombre,
      descripcion: group.descripcion ?? ""
    });
  }

  const submitGroup = handleSubmitGroup(async (values) => {
    await clientApiFetch(`/api/groups/${group.id}`, token, {
      method: "PUT",
      body: JSON.stringify({
        nombre: values.nombre.trim(),
        descripcion: values.descripcion?.trim() || undefined
      })
    })
      .then(() => {
        sileo.success({ title: "Grupo actualizado" });
        closeEditGroupModal();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: "No se pudo actualizar", description: error.message }));
  });

  const submitStudent = handleSubmit(async (values) => {
    const parsedAge = Number(values.edad);
    const payload = {
      nombre: values.nombre.trim(),
      apellido: values.apellido.trim(),
      edad: parsedAge,
      celular: values.celular.trim() || undefined,
      esMenorDeEdad: parsedAge < 18,
      nombrePadre: values.nombrePadre.trim() || undefined,
      telefonoPadre: values.telefonoPadre.trim() || undefined,
      parentesco: values.parentesco.trim() || undefined,
      grupoId: group.id,
      diaCobro: Number(values.diaCobro),
      precioMensualidad: Number(values.precioMensualidad),
      modalidadMensualidad: values.modalidadMensualidad,
      tipoRegistro: values.tipoRegistro,
      pagoMesActual: values.pagoMesActual === "SI",
      inscripcionMonto: values.tipoRegistro === "NUEVO" ? Number(values.inscripcionMonto) : undefined,
      inscripcionPagada: values.tipoRegistro === "NUEVO" ? values.inscripcionPagada === "SI" : false,
      inscripcionMetodoPago:
        values.tipoRegistro === "NUEVO" && values.inscripcionPagada === "SI" ? values.inscripcionMetodoPago : undefined
    };

    if (!payload.precioMensualidad || !payload.diaCobro) {
      sileo.error({ title: "Faltan datos", description: "Configura la mensualidad y el dia de cobro del alumno." });
      return;
    }

    if (values.tipoRegistro === "NUEVO" && !Number(values.inscripcionMonto)) {
      sileo.error({ title: "Inscripcion requerida", description: "Ingresa el valor de la inscripcion del alumno nuevo." });
      return;
    }

    await clientApiFetch("/api/students", token, {
      method: "POST",
      body: JSON.stringify(payload)
    })
      .then(() => {
        sileo.success({ title: "Alumno agregado", description: "El alumno ya quedo vinculado a este grupo." });
        closeAddStudentModal();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: "No se pudo guardar", description: error.message }));
  });

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-white px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft sm:px-6 sm:py-6">
          <div className="space-y-5">
            <div>
              <button
                type="button"
                onClick={() => router.push("/dashboard/grupos")}
                className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
              >
                <FiChevronLeft className="size-4" />
                Volver a grupos
              </button>
            </div>

            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-400">Grupo</p>
              <h1 className="mt-2 text-[1.8rem] font-black tracking-tight text-ink-950 sm:text-[2.1rem]">{group.nombre}</h1>
              <p className="mt-2 text-sm text-ink-500">{group.descripcion || "Sin descripcion registrada para este grupo."}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <MiniStatCard
                title="Ingreso estimado"
                value={currency(summary.estimatedIncome)}
                helper={`${summary.activeStudents} alumnos activos`}
                tone="success"
                icon={<FiDollarSign className="size-4" />}
              />
              <MiniStatCard
                title="Con mensualidad"
                value={String(summary.studentsWithMonthlyFee)}
                helper="alumnos con valor"
                tone="blue"
                icon={<FiUsers className="size-4" />}
              />
              <MiniStatCard
                title="Pendientes"
                value={String(summary.pendingCount)}
                helper="mensualidades"
                tone="warning"
                icon={<FiClock className="size-4" />}
              />
              <MiniStatCard
                title="Vencidos"
                value={String(summary.overdueCount)}
                helper="mensualidades"
                tone="danger"
                icon={<FiAlertTriangle className="size-4" />}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button className="min-h-11 rounded-[18px] px-5 text-sm font-semibold" onClick={openAddStudentModal}>
                <FiPlus className="size-4" />
                Agregar alumno
              </Button>
              <Button className="min-h-11 rounded-[18px] px-5 text-sm font-semibold" variant="secondary" onClick={openEditGroupModal}>
                <FiEdit2 className="size-4" />
                Editar grupo
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft sm:px-6 sm:py-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[1.7rem] font-black tracking-tight text-ink-950">Alumnos</h2>
              <p className="mt-1 text-sm font-semibold text-ink-400">
                {filteredStudents.length}/{group.students.length}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="relative block">
              <FiSearch className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar en este grupo"
                className="field-base h-11 rounded-[18px] pl-11 text-[14px]"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    "rounded-[16px] border px-4 py-2 text-[13px] font-semibold transition",
                    filter === option.value
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {filteredStudents.length ? (
                filteredStudents.map((student) => {
                  const payment = currentPayment(student);
                  return (
                    <article
                      key={student.id}
                      className="rounded-[24px] border border-ink-100 bg-white px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-brand-50 text-sm font-bold text-brand-700">
                          {getInitials(student.nombre, student.apellido)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-[14px] font-bold text-ink-950">
                                {student.nombre} {student.apellido}
                              </h3>
                              <p className="mt-1 text-[12px] text-ink-500">
                                {student.estado} · {currency(student.precioMensualidad ?? 0)} · {paymentStateCopy(payment?.estado)}
                              </p>
                            </div>
                            <StatusBadge value={student.estado} />
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <DetailPill label="Mensualidad" value={currency(student.precioMensualidad ?? 0)} />
                            <DetailPill label="Este mes" value={paymentStateCopy(payment?.estado)} />
                            <DetailPill
                              label="Cobro"
                              value={
                                payment?.estado === "PAGADO"
                                  ? "Ya pago"
                                  : payment?.fechaVencimiento
                                    ? `Vence ${formatShortDate(payment.fechaVencimiento)}`
                                    : `Dia ${student.diaCobro ?? "-"}`
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-[24px] border border-dashed border-ink-200 bg-ink-50 px-5 py-12 text-center">
                  <p className="text-base font-bold text-ink-900">No hay alumnos para este filtro</p>
                  <p className="mt-2 text-sm text-ink-500">Prueba otro chip o busca con otro nombre.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={addStudentOpen}
        onClose={closeAddStudentModal}
        title="Agregar alumno"
        description={`Este alumno quedara asociado a ${group.nombre} desde el momento en que lo guardes.`}
      >
        <form className="space-y-5" onSubmit={submitStudent}>
          <div className="space-y-3">
            <Field label="Tipo de registro">
              <div className="grid grid-cols-2 gap-2">
                <SelectChip checked={watch("tipoRegistro") === "NUEVO"} onClick={() => reset({ ...watch(), tipoRegistro: "NUEVO" })}>
                  Nuevo
                </SelectChip>
                <SelectChip checked={watch("tipoRegistro") === "ANTIGUO"} onClick={() => reset({ ...watch(), tipoRegistro: "ANTIGUO" })}>
                  Antiguo
                </SelectChip>
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" error={errors.nombre?.message}>
                <input className="field-base" {...register("nombre", { required: "Ingresa el nombre" })} />
              </Field>
              <Field label="Apellido" error={errors.apellido?.message}>
                <input className="field-base" {...register("apellido", { required: "Ingresa el apellido" })} />
              </Field>
              <Field label="Edad" error={errors.edad?.message}>
                <input type="number" className="field-base" {...register("edad", { required: "Ingresa la edad" })} />
              </Field>
              <Field label="Celular">
                <input className="field-base" {...register("celular")} />
              </Field>
            </div>

            {isMinor ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre del acudiente">
                  <input className="field-base" {...register("nombrePadre")} />
                </Field>
                <Field label="Telefono del acudiente">
                  <input className="field-base" {...register("telefonoPadre")} />
                </Field>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mensualidad" error={errors.precioMensualidad?.message}>
                <input type="number" className="field-base" {...register("precioMensualidad", { required: "Ingresa la mensualidad" })} />
              </Field>
              <Field label="Dia de cobro" error={errors.diaCobro?.message}>
                <input type="number" min={1} max={28} className="field-base" {...register("diaCobro", { required: "Ingresa el dia de cobro" })} />
              </Field>
            </div>

            <Field label="Modalidad de mensualidad">
              <div className="grid gap-2 sm:grid-cols-2">
                <SelectChip
                  checked={billingMode === "ANTICIPADA"}
                  onClick={() => reset({ ...watch(), modalidadMensualidad: "ANTICIPADA" })}
                  helper="Se paga cuando inicia el periodo."
                >
                  Anticipada
                </SelectChip>
                <SelectChip
                  checked={billingMode === "VENCIDA"}
                  onClick={() => reset({ ...watch(), modalidadMensualidad: "VENCIDA" })}
                  helper="Se paga al final del periodo."
                >
                  Vencida
                </SelectChip>
              </div>
            </Field>

            {registrationType === "ANTIGUO" ? (
              <Field label="Pago del mes actual">
                <div className="grid grid-cols-2 gap-2">
                  <SelectChip checked={watch("pagoMesActual") === "SI"} onClick={() => reset({ ...watch(), pagoMesActual: "SI" })}>
                    Ya pago
                  </SelectChip>
                  <SelectChip checked={watch("pagoMesActual") === "NO"} onClick={() => reset({ ...watch(), pagoMesActual: "NO" })}>
                    Aun no
                  </SelectChip>
                </div>
              </Field>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Valor de inscripcion">
                    <input type="number" className="field-base" {...register("inscripcionMonto")} />
                  </Field>
                  <Field label="Inscripcion pagada">
                    <div className="grid grid-cols-2 gap-2">
                      <SelectChip checked={enrollmentPaid === "SI"} onClick={() => reset({ ...watch(), inscripcionPagada: "SI" })}>
                        Si
                      </SelectChip>
                      <SelectChip checked={enrollmentPaid === "NO"} onClick={() => reset({ ...watch(), inscripcionPagada: "NO" })}>
                        No
                      </SelectChip>
                    </div>
                  </Field>
                </div>

                {enrollmentPaid === "SI" ? (
                  <Field label="Metodo de pago">
                    <div className="grid grid-cols-2 gap-2">
                      {PAYMENT_METHODS.map((method) => (
                        <SelectChip
                          key={method.value}
                          checked={watch("inscripcionMetodoPago") === method.value}
                          onClick={() => reset({ ...watch(), inscripcionMetodoPago: method.value })}
                        >
                          {method.label}
                        </SelectChip>
                      ))}
                    </div>
                  </Field>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-11 flex-1 rounded-[18px]" type="button" variant="secondary" onClick={closeAddStudentModal}>
              Cancelar
            </Button>
            <Button className="min-h-11 flex-1 rounded-[18px]" type="submit" loading={isSubmitting}>
              Guardar alumno
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editGroupOpen}
        onClose={closeEditGroupModal}
        title="Editar grupo"
        description="Actualiza el nombre o la descripcion del grupo sin afectar a los alumnos que ya tiene."
      >
        <form className="space-y-5" onSubmit={submitGroup}>
          <Field label="Nombre del grupo" error={groupErrors.nombre?.message}>
            <input className="field-base" {...registerGroup("nombre", { required: "Ingresa el nombre del grupo" })} />
          </Field>

          <Field label="Descripcion">
            <textarea className="field-base min-h-28 resize-none" {...registerGroup("descripcion")} />
          </Field>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-11 flex-1 rounded-[18px]" type="button" variant="secondary" onClick={closeEditGroupModal}>
              Cancelar
            </Button>
            <Button className="min-h-11 flex-1 rounded-[18px]" type="submit" loading={isSavingGroup}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MiniStatCard({
  title,
  value,
  helper,
  tone,
  icon
}: {
  title: string;
  value: string;
  helper: string;
  tone: "success" | "blue" | "warning" | "danger";
  icon: ReactNode;
}) {
  const styles = {
    success: "bg-emerald-50 text-brand-600",
    blue: "bg-sky-50 text-sky-600",
    warning: "bg-amber-50 text-amber-600",
    danger: "bg-rose-50 text-rose-600"
  }[tone];

  return (
    <article className="rounded-[24px] border border-ink-100 bg-white px-4 py-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold leading-snug text-ink-500">{title}</p>
        <div className={cn("flex size-8 items-center justify-center rounded-[14px]", styles)}>{icon}</div>
      </div>
      <p className={cn("mt-3 text-[1.35rem] font-black tracking-tight leading-none sm:text-[1.45rem]", styles.split(" ")[1])}>
        {value}
      </p>
      <p className="mt-2 text-[11px] font-semibold leading-snug text-ink-500">{helper}</p>
    </article>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-ink-100 bg-ink-50/70 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <p className="mt-1 text-[12px] font-semibold leading-snug text-ink-900">{value}</p>
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

function SelectChip({
  checked,
  onClick,
  children,
  helper
}: {
  checked: boolean;
  onClick: () => void;
  children: ReactNode;
  helper?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[18px] border px-4 py-3 text-left transition",
        checked ? "border-brand-200 bg-brand-50 text-brand-700" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
            checked ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-transparent"
          )}
        >
          <FiCheckCircle className="size-3.5" />
        </span>
        <span className="block min-w-0">
          <span className="block text-[13px] font-semibold">{children}</span>
          {helper ? <span className="mt-1 block text-[12px] leading-snug text-ink-500">{helper}</span> : null}
        </span>
      </div>
    </button>
  );
}

function currentPayment(student: GroupDetailStudent) {
  return student.monthlyPayments[0];
}

function paymentStateCopy(status?: PaymentStatus) {
  if (status === "PAGADO") return "Pago del mes al dia";
  if (status === "VENCIDO") return "Pago vencido";
  if (status === "PENDIENTE") return "Pago pendiente";
  return "Sin cobro generado";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function getInitials(nombre: string, apellido: string) {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function createStudentDefaults(): StudentFormValues {
  return {
    tipoRegistro: "NUEVO",
    pagoMesActual: "NO",
    inscripcionPagada: "NO",
    inscripcionMonto: "",
    inscripcionMetodoPago: "",
    modalidadMensualidad: "ANTICIPADA",
    nombre: "",
    apellido: "",
    edad: "",
    celular: "",
    nombrePadre: "",
    telefonoPadre: "",
    parentesco: "",
    diaCobro: "",
    precioMensualidad: ""
  };
}
