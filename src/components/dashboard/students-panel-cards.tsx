"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";
import { FiCheck, FiChevronLeft, FiChevronRight, FiPhone, FiPlus, FiRefreshCw, FiSearch, FiUsers } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency } from "@/lib/web-utils";
import type {
  GroupSummary,
  StudentListFilter,
  StudentListItem,
  StudentListResponse,
  StudentPaymentHistoryItem,
  StudentPaymentHistoryResponse
} from "@/lib/web-types";

type CreateStep = "TYPE" | "ENROLLMENT" | "CURRENT_PAYMENT" | "MONTHLY" | "HISTORY" | "FORM";

type StudentFormValues = {
  tipoRegistro: "NUEVO" | "ANTIGUO";
  pagoMesActual: "SI" | "NO";
  mensualidadMetodoPagoActual: string;
  inscripcionPagada: "SI" | "NO";
  inscripcionMonto: string;
  inscripcionMetodoPago: string;
  modalidadMensualidad: "ANTICIPADA" | "VENCIDA";
  inicioClasesMes: string;
  inicioClasesAnio: string;
  mesesPagados: string[];
  nombre: string;
  apellido: string;
  edad: string;
  celular: string;
  nombrePadre: string;
  telefonoPadre: string;
  parentesco: string;
  grupoId: string;
  diaCobro: string;
  precioMensualidad: string;
};

const FILTER_OPTIONS: Array<{ label: string; value: StudentListFilter }> = [
  { label: "Todos", value: "todos" },
  { label: "Activos", value: "activos" },
  { label: "Al día", value: "aldia" },
  { label: "Pendientes", value: "pendientes" },
  { label: "Inactivos", value: "inactivos" }
];

const PAYMENT_METHODS = [
  { label: "Efectivo", value: "EFECTIVO" },
  { label: "Transferencia", value: "TRANSFERENCIA" },
  { label: "Nequi", value: "NEQUI" },
  { label: "Daviplata", value: "DAVIPLATA" }
];

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function StudentsPanelCards({
  students,
  groups
}: {
  students: StudentListResponse;
  groups: GroupSummary[];
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const token = session?.user.apiToken ?? "";
  const [query, setQuery] = useState(students.filters.q);
  const [step, setStep] = useState<CreateStep>("TYPE");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StudentListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentListItem | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<StudentPaymentHistoryResponse | null>(null);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(null);
  const [paymentHistorySuccess, setPaymentHistorySuccess] = useState<string | null>(null);
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<StudentFormValues>({
    defaultValues: createDefaultValues(groups[0]?.id ?? "")
  });

  const registrationType = watch("tipoRegistro");
  const paidCurrentMonth = watch("pagoMesActual");
  const currentMonthPaymentMethod = watch("mensualidadMetodoPagoActual");
  const enrollmentPaid = watch("inscripcionPagada");
  const enrollmentMethod = watch("inscripcionMetodoPago");
  const billingMode = watch("modalidadMensualidad");
  const historyStartMonth = watch("inicioClasesMes");
  const historyStartYear = watch("inicioClasesAnio");
  const paidHistoryMonths = watch("mesesPagados") ?? [];
  const selectedGroup = watch("grupoId");
  const selectedBillingDay = watch("diaCobro");
  const age = Number(watch("edad") || 0);
  const isMinor = age > 0 && age < 18;
  const historyPeriods = createMonthlyPeriodRange(Number(historyStartMonth), Number(historyStartYear));

  const visibleStudents = students.items;
  const currentFilter = students.filters.status;
  const currentGroupId = students.filters.groupId ?? "";
  const pagination = students.pagination;

  useEffect(() => {
    setQuery(students.filters.q);
  }, [students.filters.q]);

  function updateList(params: {
    q?: string;
    status?: StudentListFilter;
    page?: number;
    groupId?: string;
  }) {
    const search = new URLSearchParams();
    const nextQ = params.q ?? query;
    const nextStatus = params.status ?? currentFilter;
    const nextPage = params.page ?? pagination.page;
    const nextGroupId = params.groupId ?? currentGroupId;

    if (nextQ.trim()) search.set("q", nextQ.trim());
    if (nextStatus !== "todos") search.set("status", nextStatus);
    if (nextGroupId) search.set("groupId", nextGroupId);
    if (nextPage > 1) search.set("page", String(nextPage));
    search.set("pageSize", String(pagination.pageSize));

    router.replace(search.toString() ? `${pathname}?${search.toString()}` : pathname);
  }

  function openCreateModal() {
    if (!groups.length) {
      sileo.error({ title: "Primero crea un grupo", description: "Necesitas al menos un grupo para registrar alumnos." });
      return;
    }
    setEditTarget(null);
    resetPaymentHistoryState();
    reset(createDefaultValues(groups[0]?.id ?? ""));
    setStep("TYPE");
    setCreateOpen(true);
  }

  function openEditModal(student: StudentListItem) {
    setEditTarget(student);
    reset(createEditValues(student));
    resetPaymentHistoryState();
    setStep("FORM");
    setCreateOpen(true);
    void loadPaymentHistory(student.id);
  }

  function closeCreateModal() {
    if (isSubmitting) return;
    setCreateOpen(false);
    setEditTarget(null);
    resetPaymentHistoryState();
    setStep("TYPE");
    reset(createDefaultValues(groups[0]?.id ?? ""));
  }

  function resetPaymentHistoryState() {
    setPaymentHistory(null);
    setPaymentHistoryLoading(false);
    setPaymentHistoryError(null);
    setPaymentHistorySuccess(null);
    setUpdatingPaymentId(null);
  }

  async function loadPaymentHistory(studentId: string) {
    setPaymentHistoryLoading(true);
    setPaymentHistoryError(null);
    setPaymentHistorySuccess(null);

    await clientApiFetch<StudentPaymentHistoryResponse>(`/api/students/${studentId}/payment-history`, token)
      .then((response) => setPaymentHistory(response))
      .catch((error: Error) => setPaymentHistoryError(error.message))
      .finally(() => setPaymentHistoryLoading(false));
  }

  async function updatePaymentHistoryMonth(payment: StudentPaymentHistoryItem, paid: boolean) {
    if (!editTarget) return;

    setUpdatingPaymentId(payment.id);
    setPaymentHistoryError(null);
    setPaymentHistorySuccess(null);

    await clientApiFetch<StudentPaymentHistoryResponse>(`/api/students/${editTarget.id}/payment-history`, token, {
      method: "PATCH",
      body: JSON.stringify({
        paymentId: payment.id,
        paid,
        metodoPago: paid ? payment.metodoPago ?? "MANUAL" : undefined
      })
    })
      .then((response) => {
        setPaymentHistory(response);
        setPaymentHistorySuccess(paid ? "Mes marcado como pagado." : "Mes marcado como no pagado.");
        sileo.success({
          title: paid ? "Mensualidad pagada" : "Mensualidad pendiente",
          description: "El historial del alumno ya quedo actualizado."
        });
        router.refresh();
      })
      .catch((error: Error) => {
        setPaymentHistoryError(error.message);
        sileo.error({ title: "No se pudo actualizar", description: error.message });
      })
      .finally(() => setUpdatingPaymentId(null));
  }

  function goNextFromType() {
    if (registrationType === "NUEVO") {
      setStep("ENROLLMENT");
      return;
    }
    setStep("HISTORY");
  }

  function goBackStep() {
    if (editTarget) {
      closeCreateModal();
      return;
    }
    if (step === "FORM") {
      setStep(registrationType === "ANTIGUO" ? "HISTORY" : "MONTHLY");
      return;
    }
    if (step === "HISTORY") {
      setStep("TYPE");
      return;
    }
    if (step === "MONTHLY") {
      setStep("CURRENT_PAYMENT");
      return;
    }
    if (step === "CURRENT_PAYMENT") {
      setStep(registrationType === "NUEVO" ? "ENROLLMENT" : "TYPE");
      return;
    }
    if (step === "ENROLLMENT") {
      setStep("TYPE");
    }
  }

  function goNextFromEnrollment() {
    if (!Number(watch("inscripcionMonto"))) {
      sileo.error({
        title: "Inscripción requerida",
        description: "Ingresa el valor de la inscripción para continuar."
      });
      return;
    }
    setStep("CURRENT_PAYMENT");
  }

  function goNextFromCurrentPayment() {
    if (paidCurrentMonth === "SI" && !currentMonthPaymentMethod) {
      sileo.error({
        title: "Método de pago requerido",
        description: "Selecciona cómo pagaron la mensualidad actual."
      });
      return;
    }

    setStep("MONTHLY");
  }

  function goNextFromMonthly() {
    if (!Number(watch("precioMensualidad"))) {
      sileo.error({
        title: "Mensualidad requerida",
        description: "Ingresa el valor de la mensualidad para continuar."
      });
      return;
    }

    if (!Number(watch("diaCobro"))) {
      sileo.error({
        title: "Día de cobro requerido",
        description: "Selecciona el día de cobro mensual."
      });
      return;
    }

    setStep("FORM");
  }

  function goNextFromHistory() {
    const startMonth = Number(watch("inicioClasesMes"));
    const startYear = Number(watch("inicioClasesAnio"));
    const monthlyPrice = Number(watch("precioMensualidad"));
    const billingDay = Number(watch("diaCobro"));

    if (!startMonth || !startYear) {
      sileo.error({
        title: "Inicio de clases requerido",
        description: "Selecciona desde qué mes y año empezó clases el estudiante."
      });
      return;
    }

    if (!createMonthlyPeriodRange(startMonth, startYear).length) {
      sileo.error({
        title: "Fecha no valida",
        description: "El inicio de clases no puede estar en el futuro."
      });
      return;
    }

    if (!monthlyPrice) {
      sileo.error({
        title: "Mensualidad requerida",
        description: "Ingresa el valor de la mensualidad para generar el historial."
      });
      return;
    }

    if (!billingDay) {
      sileo.error({
        title: "Día de cobro requerido",
        description: "Selecciona el día de cobro mensual."
      });
      return;
    }

    setStep("FORM");
  }

  const submitStudent = handleSubmit(async (values) => {
    const parsedAge = Number(values.edad);
    const isNewStudent = values.tipoRegistro === "NUEVO";
    const payload = {
      nombre: values.nombre.trim(),
      apellido: values.apellido.trim(),
      edad: parsedAge,
      celular: values.celular.trim() || undefined,
      esMenorDeEdad: parsedAge < 18,
      nombrePadre: values.nombrePadre.trim() || undefined,
      telefonoPadre: values.telefonoPadre.trim() || undefined,
      parentesco: values.parentesco.trim() || undefined,
      grupoId: values.grupoId,
      diaCobro: Number(values.diaCobro),
      precioMensualidad: Number(values.precioMensualidad),
      modalidadMensualidad: values.modalidadMensualidad,
      tipoRegistro: values.tipoRegistro,
      pagoMesActual: isNewStudent ? values.pagoMesActual === "SI" : values.mesesPagados.includes(currentPeriodKey()),
      mensualidadMetodoPagoActual:
        (isNewStudent && values.pagoMesActual === "SI") || (!isNewStudent && values.mesesPagados.length)
          ? values.mensualidadMetodoPagoActual
          : undefined,
      inicioClasesMes: isNewStudent ? undefined : Number(values.inicioClasesMes),
      inicioClasesAnio: isNewStudent ? undefined : Number(values.inicioClasesAnio),
      mesesPagados: isNewStudent ? undefined : values.mesesPagados.map(parsePeriodKey).filter(isMonthlyPeriod),
      inscripcionMonto: isNewStudent ? Number(values.inscripcionMonto) : undefined,
      inscripcionPagada: isNewStudent ? values.inscripcionPagada === "SI" : false,
      inscripcionMetodoPago:
        isNewStudent && values.inscripcionPagada === "SI" ? values.inscripcionMetodoPago : undefined
    };

    const isEditing = Boolean(editTarget);
    const requestPayload = isEditing
      ? {
          nombre: payload.nombre,
          apellido: payload.apellido,
          edad: payload.edad,
          celular: payload.celular,
          esMenorDeEdad: payload.esMenorDeEdad,
          nombrePadre: payload.nombrePadre,
          telefonoPadre: payload.telefonoPadre,
          parentesco: payload.parentesco,
          grupoId: payload.grupoId,
          diaCobro: payload.diaCobro,
          precioMensualidad: payload.precioMensualidad,
          modalidadMensualidad: payload.modalidadMensualidad
        }
      : payload;

    await clientApiFetch(isEditing ? `/api/students/${editTarget?.id}` : "/api/students", token, {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify(requestPayload)
    })
      .then(() => {
        sileo.success({
          title: isEditing ? "Alumno actualizado" : "Alumno creado",
          description: isEditing ? "Los cambios del alumno ya quedaron guardados." : "El alumno ya quedo registrado en Duali."
        });
        closeCreateModal();
        router.refresh();
      })
      .catch((error: Error) => {
        sileo.error({
          title: isEditing ? "No se pudo actualizar" : "No se pudo guardar",
          description: error.message
        });
      });
  });

  async function deleteStudent() {
    if (!deleteTarget) return;
    await clientApiFetch(`/api/students/${deleteTarget.id}`, token, { method: "DELETE" })
      .then(() => {
        sileo.success({ title: "Alumno desactivado" });
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
                <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-400">Directorio</p>
                <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-ink-950 sm:text-[2.2rem]">Alumnos</h1>
                <p className="mt-2 text-sm text-ink-500">Administra estudiantes, cobros y estado de mensualidad.</p>
              </div>
              <Button className="min-h-11 rounded-[18px] px-5 text-sm font-semibold" onClick={openCreateModal}>
                <FiPlus className="size-4" />
                Agregar alumno
              </Button>
            </div>

            <form
              className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                updateList({ q: query, page: 1 });
              }}
            >
              <div className="relative">
                <FiSearch className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre, apellido o teléfono"
                  className="field-base h-11 rounded-[18px] pl-11 text-[14px]"
                />
              </div>
              <select
                value={currentGroupId}
                onChange={(event) => updateList({ groupId: event.target.value, page: 1 })}
                className="field-base h-11 rounded-[18px] text-[14px]"
              >
                <option value="">Todos los grupos</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.nombre}
                  </option>
                ))}
              </select>
              <Button type="submit" className="min-h-11 rounded-[18px] px-5 text-sm font-semibold">
                Buscar
              </Button>
            </form>

            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateList({ status: option.value, page: 1 })}
                  className={cn(
                    "rounded-[16px] border px-4 py-2 text-[13px] font-semibold transition",
                    currentFilter === option.value
                      ? "border-ink-950 bg-ink-950 text-white"
                      : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink-100 bg-white shadow-soft">
          <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold text-ink-950">Listado de alumnos</h2>
              <p className="mt-1 text-sm text-ink-500">
                {students.pagination.total} total · pág. {students.pagination.page}/{students.pagination.totalPages}
              </p>
            </div>
            <p className="text-sm text-ink-500">Fichas organizadas por alumno con la información clave bien alineada.</p>
          </div>

          {!visibleStudents.length ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-ink-50 text-ink-400">
                <FiUsers className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-ink-950">No encontramos alumnos</h3>
              <p className="mt-2 text-sm text-ink-500">Cambia el filtro o registra un alumno nuevo.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6">
                {visibleStudents.map((student) => {
                  const contact = resolveStudentContact(student);
                  return (
                    <article
                      key={student.id}
                      className="rounded-[24px] border border-ink-100 bg-white px-4 py-4 shadow-sm transition hover:border-ink-200 hover:shadow-md"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-brand-50 text-sm font-bold text-brand-700">
                              {getInitials(student.nombre, student.apellido)}
                            </div>
                            <button type="button" className="text-left" onClick={() => openEditModal(student)}>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-[15px] font-semibold text-ink-950">
                                  {student.nombre} {student.apellido}
                                </h3>
                                <StatusBadge value={student.estado} />
                              </div>
                              <p className="mt-1 text-sm text-ink-500">
                                {student.group?.nombre ?? "Sin grupo"} · {student.edad} años · {studentPaymentLabel(student)}
                              </p>
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:self-start">
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-9 rounded-[14px] px-3.5 py-2 text-[13px] font-semibold"
                              onClick={() => openEditModal(student)}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-9 rounded-[14px] px-3.5 py-2 text-[13px] font-semibold"
                              onClick={() => setDeleteTarget(student)}
                            >
                              Desactivar
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <InfoBlock
                            label="Mensualidad"
                            value={student.precioMensualidad ? currency(student.precioMensualidad) : "Usa valor del grupo"}
                            helper={
                              studentPaymentLabel(student) === "pendiente"
                                ? "Tiene cobros pendientes o vencidos"
                                : monthlyModeCopy(student.modalidadMensualidad)
                            }
                          />
                          <InfoBlock
                            label="Cobro"
                            value={`Día ${student.diaCobro ?? 10}`}
                            helper={monthlyModeCopy(student.modalidadMensualidad)}
                          />
                          <InfoBlock
                            label="Inscripción"
                            value={student.enrollmentPayment?.estado ?? "Sin inscripción"}
                            helper={student.enrollmentPayment ? currency(student.enrollmentPayment.monto) : "No aplica"}
                          />
                          <InfoBlock
                            label="Contacto"
                            value={contact || "Sin contacto"}
                            helper={student.esMenorDeEdad ? "Acudiente o alumno" : "Teléfono principal"}
                            icon={<FiPhone className="size-3.5 text-brand-600" />}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 border-t border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs font-medium text-ink-500 sm:text-sm">
                  Mostrando {visibleStudents.length} de {students.pagination.total} alumnos
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center justify-center rounded-[12px] border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 sm:text-sm">
                    {pagination.page} / {pagination.totalPages}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-10 rounded-[14px] px-3 text-xs font-semibold sm:text-[13px]"
                      disabled={pagination.page <= 1}
                      onClick={() => updateList({ page: pagination.page - 1 })}
                    >
                      <FiChevronLeft className="size-4" />
                      <span className="truncate">Anterior</span>
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-10 rounded-[14px] px-3 text-xs font-semibold sm:text-[13px]"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => updateList({ page: pagination.page + 1 })}
                    >
                      <span className="truncate">Siguiente</span>
                      <FiChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title={editTarget ? "Editar alumno" : "Nuevo alumno"}
        description={
          editTarget
            ? "Actualiza los datos personales, el grupo y la configuración de cobro del alumno."
            : stepProgressLabel(step, registrationType)
        }
      >
        <div className="space-y-6">
          {editTarget ? null : (
            <>
              <div>
                <h3 className="text-xl font-black tracking-tight text-ink-950 sm:text-2xl">{stepTitle(step)}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-ink-500">{stepCopy(step)}</p>
              </div>

              <div className="flex gap-2">
                {Array.from({ length: stepTotal(registrationType) }, (_, index) => (
                  <div key={index} className={progressDotClass(index < stepIndex(step, registrationType))} />
                ))}
              </div>
            </>
          )}

          {step === "TYPE" ? (
            <div className="space-y-4">
              <DecisionCard
                title="Estudiante nuevo"
                subtitle="Tendrá inscripción y luego definirás si ya cubrió la mensualidad de este mes."
                selected={registrationType === "NUEVO"}
                onClick={() => {
                  reset(
                    {
                      ...watch(),
                      tipoRegistro: "NUEVO",
                      pagoMesActual: "NO"
                    },
                    { keepDirty: true, keepTouched: true }
                  );
                }}
              />
              <DecisionCard
                title="Estudiante antiguo"
                subtitle="Ya venía asistiendo antes de registrarlo en Duali."
                selected={registrationType === "ANTIGUO"}
                onClick={() => {
                  reset(
                    {
                      ...watch(),
                      tipoRegistro: "ANTIGUO"
                    },
                    { keepDirty: true, keepTouched: true }
                  );
                }}
              />
              <Button className="min-h-12 w-full" onClick={goNextFromType}>
                Siguiente
              </Button>
            </div>
          ) : null}

          {step === "ENROLLMENT" ? (
            <div className="space-y-4">
              <div className="space-y-4 rounded-[24px] border border-ink-100 bg-ink-50/60 px-4 py-4">
                <div>
                  <p className="text-sm font-black text-ink-950">Inscripción del alumno</p>
                  <p className="mt-1 text-sm text-ink-500">
                    Define el valor de la inscripción y si ya entró a caja o quedará pendiente por cobrar.
                  </p>
                </div>

                <Field label="Valor de inscripción" error={errors.inscripcionMonto?.message}>
                  <input
                    className="field-base"
                    inputMode="numeric"
                    {...register("inscripcionMonto", {
                      required: registrationType === "NUEVO" ? "Ingresa el valor de la inscripción" : false
                    })}
                  />
                </Field>

                <DecisionCard
                  title="Ya pagó la inscripción"
                  subtitle="Se registrará como ingreso del día."
                  selected={enrollmentPaid === "SI"}
                  onClick={() => {
                    reset(
                      {
                        ...watch(),
                        inscripcionPagada: "SI"
                      },
                      { keepDirty: true, keepTouched: true }
                    );
                  }}
                />
                <DecisionCard
                  title="No ha pagado la inscripción"
                  subtitle="Quedará pendiente para recordarle después."
                  selected={enrollmentPaid === "NO"}
                  onClick={() => {
                    reset(
                      {
                        ...watch(),
                        inscripcionPagada: "NO"
                      },
                      { keepDirty: true, keepTouched: true }
                    );
                  }}
                />

                {enrollmentPaid === "SI" ? (
                  <div className="space-y-3">
                    <p className="text-sm font-black text-ink-900">Método de pago de inscripción</p>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_METHODS.map((method) => (
                        <ChipButton
                          key={method.value}
                          selected={enrollmentMethod === method.value}
                          onClick={() => {
                            reset(
                              {
                                ...watch(),
                                inscripcionMetodoPago: method.value
                              },
                              { keepDirty: true, keepTouched: true }
                            );
                          }}
                        >
                          {method.label}
                        </ChipButton>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={goBackStep}>
                  Atrás
                </Button>
                <Button className="min-h-12 flex-1" type="button" onClick={goNextFromEnrollment}>
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}

          {step === "CURRENT_PAYMENT" ? (
            <div className="space-y-4">
              <div className="space-y-4 rounded-[24px] border border-ink-100 bg-white px-4 py-4">
                <div>
                  <p className="text-sm font-black text-ink-950">Pago del mes actual</p>
                  <p className="mt-1 text-sm text-ink-500">
                    Define si este mes ya entró a caja. Si marcó que sí, se registrará como ingreso.
                  </p>
                </div>

                <DecisionCard
                  title="Sí, ya pagó este mes"
                  subtitle="Se registrará el mes actual como pagado y el ingreso entrará a caja."
                  selected={paidCurrentMonth === "SI"}
                  onClick={() => {
                    reset(
                      {
                        ...watch(),
                        pagoMesActual: "SI"
                      },
                      { keepDirty: true, keepTouched: true }
                    );
                  }}
                />
                <DecisionCard
                  title="No ha pagado este mes"
                  subtitle={
                    registrationType === "NUEVO"
                      ? "El primer cobro empezará en el siguiente mes para este alumno nuevo."
                      : "Se creará el cobro del mes actual según su día de pago."
                  }
                  selected={paidCurrentMonth === "NO"}
                  onClick={() => {
                    reset(
                      {
                        ...watch(),
                        pagoMesActual: "NO"
                      },
                      { keepDirty: true, keepTouched: true }
                    );
                  }}
                />

                {paidCurrentMonth === "SI" ? (
                  <div className="space-y-3">
                    <p className="text-sm font-black text-ink-900">Método de pago de la mensualidad</p>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_METHODS.map((method) => (
                        <ChipButton
                          key={method.value}
                          selected={currentMonthPaymentMethod === method.value}
                          onClick={() => {
                            reset(
                              {
                                ...watch(),
                                mensualidadMetodoPagoActual: method.value
                              },
                              { keepDirty: true, keepTouched: true }
                            );
                          }}
                        >
                          {method.label}
                        </ChipButton>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={goBackStep}>
                  Atrás
                </Button>
                <Button className="min-h-12 flex-1" type="button" onClick={goNextFromCurrentPayment}>
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}

          {step === "HISTORY" ? (
            <div className="space-y-4">
              <div className="space-y-4 rounded-[24px] border border-brand-100 bg-brand-50 px-4 py-4">
                <div>
                  <p className="text-sm font-black text-ink-950">Inicio y mensualidad</p>
                  <p className="mt-1 text-sm text-ink-500">
                    Define desde cuándo empezó clases, el valor mensual y el día recurrente de cobro.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Mes de inicio" error={errors.inicioClasesMes?.message}>
                    <select
                      value={historyStartMonth}
                      onChange={(event) => {
                        reset(
                          {
                            ...watch(),
                            inicioClasesMes: event.target.value,
                            mesesPagados: []
                          },
                          { keepDirty: true, keepTouched: true }
                        );
                      }}
                      className="field-base h-11 rounded-[18px] text-[14px]"
                    >
                      <option value="">Selecciona mes</option>
                      {MONTH_LABELS.map((label, index) => (
                        <option key={label} value={String(index + 1)}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Año de inicio" error={errors.inicioClasesAnio?.message}>
                    <select
                      value={historyStartYear}
                      onChange={(event) => {
                        reset(
                          {
                            ...watch(),
                            inicioClasesAnio: event.target.value,
                            mesesPagados: []
                          },
                          { keepDirty: true, keepTouched: true }
                        );
                      }}
                      className="field-base h-11 rounded-[18px] text-[14px]"
                    >
                      <option value="">Selecciona año</option>
                      {yearOptions().map((year) => (
                        <option key={year} value={String(year)}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Valor de la mensualidad" error={errors.precioMensualidad?.message}>
                  <input
                    className="field-base"
                    inputMode="numeric"
                    {...register("precioMensualidad", { required: "Ingresa la mensualidad" })}
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DecisionCard
                    title="Anticipada"
                    subtitle="Se cobra al inicio del período."
                    selected={billingMode === "ANTICIPADA"}
                    onClick={() => {
                      reset(
                        {
                          ...watch(),
                          modalidadMensualidad: "ANTICIPADA"
                        },
                        { keepDirty: true, keepTouched: true }
                      );
                    }}
                  />
                  <DecisionCard
                    title="Vencida"
                    subtitle="Se cobra al final del período."
                    selected={billingMode === "VENCIDA"}
                    onClick={() => {
                      reset(
                        {
                          ...watch(),
                          modalidadMensualidad: "VENCIDA"
                        },
                        { keepDirty: true, keepTouched: true }
                      );
                    }}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-black text-ink-900">Día de cobro mensual</p>
                  <select
                    value={selectedBillingDay}
                    onChange={(event) => {
                      reset(
                        {
                          ...watch(),
                          diaCobro: event.target.value
                        },
                        { keepDirty: true, keepTouched: true }
                      );
                    }}
                    className="field-base h-11 rounded-[18px] text-[14px]"
                  >
                    {Array.from({ length: 28 }, (_, index) => String(index + 1)).map((day) => (
                      <option key={day} value={day}>
                        Día {day}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs font-semibold leading-5 text-ink-500">
                    Este día define cuándo vence cada mensualidad. No es la fecha de inicio del estudiante.
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-[24px] border border-ink-100 bg-white px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-ink-950">Selecciona los meses que el estudiante ya tiene pagos/al día</p>
                    <p className="mt-1 text-sm text-ink-500">
                      Los meses sin marcar se guardarán como pendientes o vencidos, incluyendo el mes actual.
                    </p>
                  </div>
                  {historyPeriods.length ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="rounded-[14px] border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-black text-brand-700"
                        onClick={() => {
                          reset(
                            {
                              ...watch(),
                              mesesPagados: historyPeriods.map(periodKey)
                            },
                            { keepDirty: true, keepTouched: true }
                          );
                        }}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        className="rounded-[14px] border border-ink-200 bg-white px-3 py-2 text-xs font-black text-ink-600"
                        onClick={() => {
                          reset(
                            {
                              ...watch(),
                              mesesPagados: []
                            },
                            { keepDirty: true, keepTouched: true }
                          );
                        }}
                      >
                        Limpiar
                      </button>
                    </div>
                  ) : null}
                </div>

                {historyPeriods.length ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {historyPeriods.map((period) => {
                        const key = periodKey(period);
                        const selected = paidHistoryMonths.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const nextMonths = selected
                                ? paidHistoryMonths.filter((value) => value !== key)
                                : [...paidHistoryMonths, key];
                              reset(
                                {
                                  ...watch(),
                                  mesesPagados: nextMonths
                                },
                                { keepDirty: true, keepTouched: true }
                              );
                            }}
                            className={cn(
                              "rounded-[18px] border px-4 py-2.5 text-sm font-black transition",
                              selected
                                ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                                : "border-rose-100 bg-rose-50 text-rose-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                            )}
                          >
                            {formatPeriod(period)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="rounded-[18px] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-600">
                      {historyPeriods.length} meses generados · {paidHistoryMonths.length} al día ·{" "}
                      {historyPeriods.length - paidHistoryMonths.length} pendientes o vencidos
                    </div>
                  </>
                ) : (
                  <div className="rounded-[18px] bg-ink-50 px-4 py-4 text-sm font-semibold text-ink-500">
                    Elige mes y año de inicio para generar los chips automáticamente.
                  </div>
                )}

                {paidHistoryMonths.length ? (
                  <div className="space-y-3">
                    <p className="text-sm font-black text-ink-900">Método de pago para los meses marcados</p>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_METHODS.map((method) => (
                        <ChipButton
                          key={method.value}
                          selected={currentMonthPaymentMethod === method.value}
                          onClick={() => {
                            reset(
                              {
                                ...watch(),
                                mensualidadMetodoPagoActual: method.value
                              },
                              { keepDirty: true, keepTouched: true }
                            );
                          }}
                        >
                          {method.label}
                        </ChipButton>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={goBackStep}>
                  Atrás
                </Button>
                <Button className="min-h-12 flex-1" type="button" onClick={goNextFromHistory}>
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}

          {step === "MONTHLY" ? (
            <div className="space-y-4">
              <div className="space-y-4 rounded-[24px] border border-brand-100 bg-brand-50 px-4 py-4">
                <div>
                  <p className="text-sm font-black text-ink-950">Mensualidad</p>
                  <p className="mt-1 text-sm text-ink-500">
                    Configura valor, tipo de mensualidad y día exacto en que se controla el cobro.
                  </p>
                </div>

                <Field label="Valor de la mensualidad" error={errors.precioMensualidad?.message}>
                  <input
                    className="field-base"
                    inputMode="numeric"
                    {...register("precioMensualidad", { required: "Ingresa la mensualidad" })}
                  />
                </Field>

                <div className="space-y-3">
                  <p className="text-sm font-black text-ink-900">Tipo de mensualidad</p>
                  <DecisionCard
                    title="Anticipada"
                    subtitle="Se cobra el día en que inicia el período mensual del alumno."
                    selected={billingMode === "ANTICIPADA"}
                    onClick={() => {
                      reset(
                        {
                          ...watch(),
                          modalidadMensualidad: "ANTICIPADA"
                        },
                        { keepDirty: true, keepTouched: true }
                      );
                    }}
                  />
                  <DecisionCard
                    title="Vencida"
                    subtitle="Se cobra al final del período, después de que el alumno ya inició."
                    selected={billingMode === "VENCIDA"}
                    onClick={() => {
                      reset(
                        {
                          ...watch(),
                          modalidadMensualidad: "VENCIDA"
                        },
                        { keepDirty: true, keepTouched: true }
                      );
                    }}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-black text-ink-900">Día de cobro mensual</p>
                  <select
                    value={selectedBillingDay}
                    onChange={(event) => {
                      reset(
                        {
                          ...watch(),
                          diaCobro: event.target.value
                        },
                        { keepDirty: true, keepTouched: true }
                      );
                    }}
                    className="field-base h-11 rounded-[18px] text-[14px]"
                  >
                    {Array.from({ length: 28 }, (_, index) => String(index + 1)).map((day) => (
                      <option key={day} value={day}>
                        Día {day}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs font-semibold leading-5 text-ink-500">
                    {billingStartCopy(registrationType, paidCurrentMonth, billingMode)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={goBackStep}>
                  Atrás
                </Button>
                <Button className="min-h-12 flex-1" type="button" onClick={goNextFromMonthly}>
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}

          {step === "FORM" ? (
            <form className="space-y-5" onSubmit={submitStudent}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre" error={errors.nombre?.message}>
                  <input className="field-base" {...register("nombre", { required: "Ingresa el nombre" })} />
                </Field>
                <Field label="Apellido" error={errors.apellido?.message}>
                  <input className="field-base" {...register("apellido", { required: "Ingresa el apellido" })} />
                </Field>
                <Field label="Edad" error={errors.edad?.message}>
                  <input className="field-base" inputMode="numeric" {...register("edad", { required: "Ingresa la edad" })} />
                </Field>
                <Field label="Celular alumno">
                  <input className="field-base" inputMode="tel" {...register("celular")} />
                </Field>
              </div>

              {isMinor ? (
                <div className="space-y-4 rounded-[24px] border border-brand-100 bg-brand-50 px-4 py-4">
                  <div>
                    <p className="text-sm font-black text-ink-950">Datos del acudiente</p>
                    <p className="mt-1 text-sm font-medium text-ink-500">
                      Como tiene menos de 18 años, estos datos ayudan con recordatorios y contacto.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nombre acudiente">
                      <input className="field-base" {...register("nombrePadre")} />
                    </Field>
                    <Field label="WhatsApp acudiente">
                      <input className="field-base" inputMode="tel" {...register("telefonoPadre")} />
                    </Field>
                    <Field label="Parentesco" className="sm:col-span-2">
                      <input className="field-base" {...register("parentesco")} />
                    </Field>
                  </div>
                </div>
              ) : null}

              {editTarget ? (
                <StudentPaymentHistorySection
                  history={paymentHistory}
                  loading={paymentHistoryLoading}
                  error={paymentHistoryError}
                  success={paymentHistorySuccess}
                  updatingPaymentId={updatingPaymentId}
                  onRetry={() => loadPaymentHistory(editTarget.id)}
                  onToggle={updatePaymentHistoryMonth}
                />
              ) : null}

              {editTarget ? (
                <div className="space-y-4 rounded-[24px] border border-ink-100 bg-ink-50/60 px-4 py-4">
                  <div>
                    <p className="text-sm font-black text-ink-950">Configuración de mensualidad</p>
                    <p className="mt-1 text-sm font-medium text-ink-500">
                      Ajusta el valor, la modalidad y el día de cobro del alumno.
                    </p>
                  </div>

                  <Field label="Valor de la mensualidad" error={errors.precioMensualidad?.message}>
                    <input
                      className="field-base"
                      inputMode="numeric"
                      {...register("precioMensualidad", { required: "Ingresa la mensualidad" })}
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DecisionCard
                      title="Anticipada"
                      subtitle="Se cobra al inicio del período."
                      selected={billingMode === "ANTICIPADA"}
                      onClick={() => {
                        reset(
                          {
                            ...watch(),
                            modalidadMensualidad: "ANTICIPADA"
                          },
                          { keepDirty: true, keepTouched: true }
                        );
                      }}
                    />
                    <DecisionCard
                      title="Vencida"
                      subtitle="Se cobra al final del período."
                      selected={billingMode === "VENCIDA"}
                      onClick={() => {
                        reset(
                          {
                            ...watch(),
                            modalidadMensualidad: "VENCIDA"
                          },
                          { keepDirty: true, keepTouched: true }
                        );
                      }}
                    />
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-black text-ink-900">Día de cobro mensual</p>
                    <select
                      value={selectedBillingDay}
                      onChange={(event) => {
                        reset(
                          {
                            ...watch(),
                            diaCobro: event.target.value
                          },
                          { keepDirty: true, keepTouched: true }
                        );
                      }}
                      className="field-base h-11 rounded-[18px] text-[14px]"
                    >
                      {Array.from({ length: 28 }, (_, index) => String(index + 1)).map((day) => (
                        <option key={day} value={day}>
                          Día {day}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <p className="text-sm font-black text-ink-900">Grupo</p>
                <select
                  value={selectedGroup}
                  onChange={(event) => {
                    reset(
                      {
                        ...watch(),
                        grupoId: event.target.value
                      },
                      { keepDirty: true, keepTouched: true }
                    );
                  }}
                  className="field-base h-11 rounded-[18px] text-[14px]"
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.nombre} - {group._count.students} alumnos
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={goBackStep}>
                  {editTarget ? "Cancelar" : "Atrás"}
                </Button>
                <Button className="min-h-12 flex-1" type="submit" loading={isSubmitting}>
                  {editTarget ? "Guardar cambios" : "Guardar alumno"}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Desactivar alumno"
        description={`El alumno ${deleteTarget?.nombre ?? ""} ${deleteTarget?.apellido ?? ""} dejará de aparecer como activo en cobros nuevos.`}
        notice="Desactiva este alumno solo si ya no debe participar en nuevos cobros ni en la operación activa."
        confirmText="Desactivar"
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteStudent}
      />
    </div>
  );
}

function StudentPaymentHistorySection({
  history,
  loading,
  error,
  success,
  updatingPaymentId,
  onRetry,
  onToggle
}: {
  history: StudentPaymentHistoryResponse | null;
  loading: boolean;
  error: string | null;
  success: string | null;
  updatingPaymentId: string | null;
  onRetry: () => void;
  onToggle: (payment: StudentPaymentHistoryItem, paid: boolean) => void;
}) {
  return (
    <section className="space-y-4 rounded-[24px] border border-ink-100 bg-white px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black text-ink-950">Historial</p>
          <p className="mt-1 text-sm font-medium text-ink-500">Consulta y actualiza los meses pagados del alumno.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="min-h-9 rounded-[14px] px-3 text-xs font-semibold"
          onClick={onRetry}
          disabled={loading}
        >
          <FiRefreshCw className={cn("size-3.5", loading ? "animate-spin" : "")} />
          Refrescar
        </Button>
      </div>

      {loading ? (
        <div className="rounded-[18px] border border-ink-100 bg-ink-50 px-4 py-4 text-sm font-semibold text-ink-500">
          Cargando historial de mensualidades...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[18px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-[18px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {success}
        </div>
      ) : null}

      {!loading && history ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoBlock label="Meses" value={String(history.summary.totalCount)} helper="Registros generados" />
            <InfoBlock label="Pagados" value={String(history.summary.paidCount)} helper="Mensualidades al dia" />
            <InfoBlock label="Pendientes" value={String(history.summary.pendingCount)} helper="Por cobrar o revisar" />
          </div>

          {history.paymentHistory.length ? (
            <div className="space-y-2">
              {history.paymentHistory.map((payment) => {
                const isPaid = payment.estado === "PAGADO";
                return (
                  <div
                    key={payment.id}
                    className="flex flex-col gap-3 rounded-[18px] border border-ink-100 bg-ink-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-ink-950">{formatPeriod(payment)}</p>
                        <StatusBadge value={payment.estado} />
                      </div>
                      <p className="mt-1 text-xs font-semibold leading-5 text-ink-500">
                        {currency(payment.monto)} · vence {formatDate(payment.fechaVencimiento)}
                        {payment.fechaPago ? ` · pagado ${formatDate(payment.fechaPago)}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={isPaid ? "secondary" : "primary"}
                      className="min-h-9 shrink-0 rounded-[14px] px-3 text-xs font-semibold"
                      loading={updatingPaymentId === payment.id}
                      disabled={Boolean(updatingPaymentId)}
                      onClick={() => onToggle(payment, !isPaid)}
                    >
                      {isPaid ? "Marcar no pagado" : "Marcar pagado"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[18px] bg-ink-50 px-4 py-4 text-sm font-semibold text-ink-500">
              Este alumno todavia no tiene mensualidades generadas.
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function InfoBlock({
  label,
  value,
  helper,
  icon
}: {
  label: string;
  value: string;
  helper: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-ink-100 bg-ink-50/65 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        {icon}
        <p className="text-[15px] font-semibold text-ink-950">{value}</p>
      </div>
      <p className="mt-1 text-xs text-ink-500">{helper}</p>
    </div>
  );
}

function Field({
  label,
  error,
  children,
  className
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="block text-sm font-black text-ink-900">{label}</span>
      {children}
      {error ? <span className="block text-sm font-semibold text-rose-600">{error}</span> : null}
    </label>
  );
}

function DecisionCard({
  title,
  subtitle,
  selected,
  onClick
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-4 rounded-[24px] border px-4 py-4 text-left transition",
        selected ? "border-brand-200 bg-brand-50" : "border-ink-200 bg-white hover:border-brand-200 hover:bg-brand-50/40"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-brand-600 text-brand-600" : "border-ink-200 text-transparent"
        )}
      >
        <FiCheck className="size-3.5" />
      </span>
      <span className="block">
        <span className={cn("block text-base font-black", selected ? "text-brand-800" : "text-ink-950")}>{title}</span>
        <span className={cn("mt-1 block text-sm font-medium leading-6", selected ? "text-brand-700" : "text-ink-500")}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function ChipButton({
  children,
  selected,
  onClick
}: {
  children: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[18px] border px-4 py-2.5 text-sm font-black transition",
        selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-800 hover:border-brand-200 hover:text-brand-700"
      )}
    >
      {children}
    </button>
  );
}

function createDefaultValues(groupId: string): StudentFormValues {
  return {
    tipoRegistro: "NUEVO",
    pagoMesActual: "NO",
    mensualidadMetodoPagoActual: "EFECTIVO",
    inscripcionPagada: "NO",
    inscripcionMonto: "",
    inscripcionMetodoPago: "EFECTIVO",
    modalidadMensualidad: "ANTICIPADA",
    inicioClasesMes: "",
    inicioClasesAnio: String(new Date().getFullYear()),
    mesesPagados: [],
    nombre: "",
    apellido: "",
    edad: "",
    celular: "",
    nombrePadre: "",
    telefonoPadre: "",
    parentesco: "",
    grupoId: groupId,
    diaCobro: "10",
    precioMensualidad: ""
  };
}

function createEditValues(student: StudentListItem): StudentFormValues {
  return {
    tipoRegistro: student.enrollmentPayment ? "NUEVO" : "ANTIGUO",
    pagoMesActual: currentPayment(student)?.estado === "PAGADO" ? "SI" : "NO",
    mensualidadMetodoPagoActual: currentPayment(student)?.metodoPago ?? "EFECTIVO",
    inscripcionPagada: student.enrollmentPayment?.estado === "PAGADO" ? "SI" : "NO",
    inscripcionMonto: student.enrollmentPayment?.monto ? String(student.enrollmentPayment.monto) : "",
    inscripcionMetodoPago: student.enrollmentPayment?.metodoPago ?? "EFECTIVO",
    modalidadMensualidad: student.modalidadMensualidad ?? "ANTICIPADA",
    inicioClasesMes: "",
    inicioClasesAnio: String(new Date().getFullYear()),
    mesesPagados: [],
    nombre: student.nombre,
    apellido: student.apellido,
    edad: String(student.edad ?? ""),
    celular: student.celular ?? "",
    nombrePadre: student.nombrePadre ?? "",
    telefonoPadre: student.telefonoPadre ?? "",
    parentesco: student.parentesco ?? "",
    grupoId: student.grupoId,
    diaCobro: String(student.diaCobro ?? 10),
    precioMensualidad: student.precioMensualidad ? String(student.precioMensualidad) : ""
  };
}

function currentPayment(student: StudentListItem) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return student.monthlyPayments?.find((payment) => payment.mes === month && payment.anio === year);
}

function hasPendingPayment(student: StudentListItem) {
  return student.monthlyPayments?.some((payment) => payment.estado === "PENDIENTE" || payment.estado === "VENCIDO") ?? false;
}

function studentPaymentLabel(student: StudentListItem) {
  const payment = currentPayment(student);
  if (payment?.estado === "PAGADO") return "al día";
  if (hasPendingPayment(student)) return "pendiente";
  return "sin cobro del mes";
}

function resolveStudentContact(student: StudentListItem) {
  if (student.esMenorDeEdad) return student.telefonoPadre || student.celular || "";
  return student.celular || student.telefonoPadre || "";
}

function getInitials(nombre: string, apellido: string) {
  return `${nombre.slice(0, 1)}${apellido.slice(0, 1)}`.toUpperCase();
}

type MonthlyPeriod = {
  mes: number;
  anio: number;
};

function createMonthlyPeriodRange(startMonth: number, startYear: number) {
  if (!startMonth || !startYear) return [];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const startValue = startYear * 12 + startMonth;
  const currentValue = currentYear * 12 + currentMonth;

  if (startValue > currentValue || currentValue - startValue > 120) return [];

  const periods: MonthlyPeriod[] = [];
  let mes = startMonth;
  let anio = startYear;

  while (anio < currentYear || (anio === currentYear && mes <= currentMonth)) {
    periods.push({ mes, anio });
    if (mes === 12) {
      mes = 1;
      anio += 1;
    } else {
      mes += 1;
    }
  }

  return periods;
}

function periodKey(period: MonthlyPeriod) {
  return `${period.anio}-${period.mes}`;
}

function currentPeriodKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

function parsePeriodKey(value: string): MonthlyPeriod | null {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return null;
  return { mes: month, anio: year };
}

function isMonthlyPeriod(period: MonthlyPeriod | null): period is MonthlyPeriod {
  return Boolean(period);
}

function formatPeriod(period: MonthlyPeriod) {
  return `${MONTH_LABELS[period.mes - 1]} ${period.anio}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function yearOptions() {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: currentYear - 2020 + 1 }, (_, index) => currentYear - index);
}

function stepSequence(registrationType: StudentFormValues["tipoRegistro"]): CreateStep[] {
  if (registrationType === "NUEVO") {
    return ["TYPE", "ENROLLMENT", "CURRENT_PAYMENT", "MONTHLY", "FORM"];
  }

  return ["TYPE", "HISTORY", "FORM"];
}

function stepIndex(step: CreateStep, registrationType: StudentFormValues["tipoRegistro"]) {
  const index = stepSequence(registrationType).indexOf(step);
  return index >= 0 ? index + 1 : 1;
}

function stepTotal(registrationType: StudentFormValues["tipoRegistro"]) {
  return stepSequence(registrationType).length;
}

function stepProgressLabel(step: CreateStep, registrationType: StudentFormValues["tipoRegistro"]) {
  return `Paso ${stepIndex(step, registrationType)} de ${stepTotal(registrationType)}`;
}

function stepTitle(step: CreateStep) {
  if (step === "TYPE") return "Tipo de estudiante";
  if (step === "ENROLLMENT") return "Inscripción";
  if (step === "CURRENT_PAYMENT") return "Pago del mes actual";
  if (step === "MONTHLY") return "Mensualidad";
  if (step === "HISTORY") return "Historial de mensualidades";
  return "Datos personales";
}

function stepCopy(step: CreateStep) {
  if (step === "TYPE") return "Primero define si el alumno llega nuevo a la academia o si ya venía asistiendo.";
  if (step === "ENROLLMENT") {
    return "La inscripción queda separada para que el registro y el cobro sean fáciles de entender.";
  }
  if (step === "CURRENT_PAYMENT") {
    return "Confirma si la mensualidad de este mes ya fue pagada antes de configurar el ciclo.";
  }
  if (step === "MONTHLY") {
    return "Define el valor mensual, la modalidad y el día de cobro que usará el sistema.";
  }
  if (step === "HISTORY") {
    return "Genera los meses desde que empezó clases y marca los que ya están al día.";
  }
  return "Completa los datos del alumno, el contacto y el grupo al que pertenece.";
}

function billingStartCopy(
  tipoRegistro: StudentFormValues["tipoRegistro"],
  pagoMesActual: StudentFormValues["pagoMesActual"],
  modalidadMensualidad: StudentFormValues["modalidadMensualidad"]
) {
  const modeCopy = billingModeExplanation(modalidadMensualidad);
  if (pagoMesActual === "SI") {
    return `Como ya pagó este mes, se registrará el ingreso actual y el siguiente cobro aparecerá en el próximo ciclo. ${modeCopy}`.trim();
  }

  if (tipoRegistro === "NUEVO") {
    return `Como es un alumno nuevo y no pagó este mes, la primera mensualidad empezará desde el siguiente mes. ${modeCopy}`.trim();
  }

  return `Como aún no pagó este mes, se creará el cobro del mes actual. Si el día ya pasó, quedará vencido; si es hoy, quedará pendiente. ${modeCopy}`.trim();
}

function billingModeExplanation(mode: StudentFormValues["modalidadMensualidad"]) {
  if (mode === "VENCIDA") {
    return "Además, al ser vencida, el cobro se toma para el final del período.";
  }
  return "Además, al ser anticipada, el cobro se toma al inicio del período.";
}

function monthlyModeCopy(mode: StudentListItem["modalidadMensualidad"]) {
  return mode === "VENCIDA" ? "Cobro al final del período" : "Cobro al inicio del período";
}

function progressDotClass(active: boolean) {
  return cn("h-1.5 flex-1 rounded-full", active ? "bg-brand-600" : "bg-ink-100");
}

