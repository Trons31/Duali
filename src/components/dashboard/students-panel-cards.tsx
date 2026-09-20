"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Controller, useForm } from "react-hook-form";
import { sileo } from "sileo";
import {
  FiBookOpen,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiCircle,
  FiClock,
  FiFilter,
  FiPauseCircle,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiUserX,
  FiUsers,
  FiX
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
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

type CreateStep =
  | "TYPE"
  | "ENROLLMENT"
  | "CURRENT_PAYMENT"
  | "MONTHLY"
  | "HISTORY"
  | "FORM"
  | "EDIT_BILLING"
  | "EDIT_STATUS"
  | "EDIT_HISTORY";

type StudentFormValues = {
  estado: "ACTIVO" | "PAUSADO" | "DESACTIVADO" | "INACTIVO";
  tipoRegistro: "NUEVO" | "ANTIGUO";
  pagoMesActual: "SI" | "NO";
  mensualidadMetodoPagoActual: string;
  mensualidadFechaPagoActual: string;
  inscripcionPagada: "SI" | "NO";
  inscripcionMonto: string;
  inscripcionFechaPago: string;
  inscripcionMetodoPago: string;
  modalidadMensualidad: "ANTICIPADA" | "VENCIDA";
  inicioClasesDia: string;
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
  pausaModo: "HASTA_REACTIVAR" | "CON_FECHA";
  fechaInicioPausa: string;
  fechaFinPausa: string;
  motivoEstado: string;
};

const FILTER_OPTIONS: Array<{ label: string; value: StudentListFilter; icon: ReactNode; iconClass: string }> = [
  { label: "Todos", value: "todos", icon: <FiUsers />, iconClass: "text-brand-600" },
  { label: "Activos", value: "activos", icon: <FiCircle />, iconClass: "text-brand-600" },
  { label: "Pausados", value: "pausados", icon: <FiPauseCircle />, iconClass: "text-amber-500" },
  { label: "Al día", value: "aldia", icon: <FiCheckCircle />, iconClass: "text-brand-600" },
  { label: "Pendientes", value: "pendientes", icon: <FiClock />, iconClass: "text-orange-500" },
  { label: "Inactivos", value: "inactivos", icon: <FiUserX />, iconClass: "text-ink-500" }
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
  const [sortOrder, setSortOrder] = useState<"recent" | "name-asc" | "name-desc">("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailStudent, setDetailStudent] = useState<StudentListItem | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
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
  const startDay = watch("inicioClasesDia");
  const historyStartMonth = watch("inicioClasesMes");
  const historyStartYear = watch("inicioClasesAnio");
  const paidHistoryMonths = watch("mesesPagados") ?? [];
  const selectedGroup = watch("grupoId");
  const selectedBillingDay = watch("diaCobro");
  const age = Number(watch("edad") || 0);
  const isMinor = age > 0 && age < 18;
  const historyPeriods = createMonthlyPeriodRange(Number(historyStartMonth), Number(historyStartYear));
  const startDayOptions = dayOptionsForMonth(Number(historyStartMonth), Number(historyStartYear));

  const visibleStudents = useMemo(() => {
    const items = [...students.items];
    if (sortOrder === "name-asc") {
      return items.sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, "es"));
    }
    if (sortOrder === "name-desc") {
      return items.sort((a, b) => `${b.nombre} ${b.apellido}`.localeCompare(`${a.nombre} ${a.apellido}`, "es"));
    }
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sortOrder, students.items]);
  const currentFilter = students.filters.status;
  const currentGroupId = students.filters.groupId ?? "";
  const activeFilterCount = Number(currentFilter !== "todos") + Number(Boolean(currentGroupId));
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
    const fechaPago = paid ? window.prompt("Fecha de pago (AAAA-MM-DD)", defaultDateValue()) : null;
    if (paid && !fechaPago) return;

    setUpdatingPaymentId(payment.id);
    setPaymentHistoryError(null);
    setPaymentHistorySuccess(null);

    await clientApiFetch<StudentPaymentHistoryResponse>(`/api/students/${editTarget.id}/payment-history`, token, {
      method: "PATCH",
      body: JSON.stringify({
        paymentId: payment.id,
        paid,
        fechaPago: paid ? fechaPago : undefined,
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
      setStep(registrationType === "ANTIGUO" ? "HISTORY" : "CURRENT_PAYMENT");
      return;
    }
    if (step === "HISTORY") {
      setStep("TYPE");
      return;
    }
    if (step === "MONTHLY") {
      setStep(registrationType === "NUEVO" ? "ENROLLMENT" : "TYPE");
      return;
    }
    if (step === "CURRENT_PAYMENT") {
      setStep("MONTHLY");
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
    setStep("MONTHLY");
  }

  function goNextFromCurrentPayment() {
    if (paidCurrentMonth === "SI" && !currentMonthPaymentMethod) {
      sileo.error({
        title: "Método de pago requerido",
        description: "Selecciona cómo pagaron la mensualidad actual."
      });
      return;
    }

    setStep("FORM");
  }

  function goNextFromMonthly() {
    if (registrationType === "NUEVO") {
      const startDateValidation = validateStartDateValues();
      if (startDateValidation) {
        sileo.error(startDateValidation);
        return;
      }
    }

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

    setStep(registrationType === "NUEVO" ? "CURRENT_PAYMENT" : "FORM");
  }

  function validateStartDateValues(allowFuture = true) {
    const day = Number(watch("inicioClasesDia"));
    const month = Number(watch("inicioClasesMes"));
    const year = Number(watch("inicioClasesAnio"));

    if (!day || !month || !year) {
      return {
        title: "Inicio de clases requerido",
        description: "Selecciona el dia, mes y año en que empieza clases el estudiante."
      };
    }

    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    const isValid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    if (!isValid) {
      return {
        title: "Fecha no valida",
        description: "El dia seleccionado no existe para ese mes."
      };
    }

    const now = new Date();
    const currentValue = now.getFullYear() * 12 + now.getMonth() + 1;
    const startValue = year * 12 + month;
    if (!allowFuture && startValue > currentValue) {
      return {
        title: "Fecha no valida",
        description: "El inicio de clases no puede estar en el futuro."
      };
    }

    if (Math.abs(currentValue - startValue) > 120) {
      return {
        title: "Fecha no valida",
        description: "El historial no puede superar 10 años."
      };
    }

    return null;
  }

  function goNextFromHistory() {
    const startMonth = Number(watch("inicioClasesMes"));
    const startYear = Number(watch("inicioClasesAnio"));
    const startDateValidation = validateStartDateValues(false);
    const monthlyPrice = Number(watch("precioMensualidad"));
    const billingDay = Number(watch("diaCobro"));

    if (startDateValidation) {
      sileo.error(startDateValidation);
      return;
    }

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

  // Cada paso de la edicion guarda con el mismo submit; esto define a donde ir
  // despues, para que "Siguiente" no avance dejando los cambios sin enviar.
  const [nextStepAfterSave, setNextStepAfterSave] = useState<CreateStep>("EDIT_BILLING");

  const submitStudent = handleSubmit(async (values) => {
    if (editTarget && values.estado === "PAUSADO" && values.pausaModo === "CON_FECHA" && !values.fechaFinPausa) {
      sileo.error({
        title: "Fecha fin requerida",
        description: "Selecciona la fecha de regreso o usa la opcion hasta reactivar."
      });
      return;
    }

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
      mensualidadFechaPagoActual:
        (isNewStudent && values.pagoMesActual === "SI") || (!isNewStudent && values.mesesPagados.length)
          ? values.mensualidadFechaPagoActual
          : undefined,
      inicioClasesDia: Number(values.inicioClasesDia),
      inicioClasesMes: Number(values.inicioClasesMes),
      inicioClasesAnio: Number(values.inicioClasesAnio),
      mesesPagados: isNewStudent ? undefined : values.mesesPagados.map(parsePeriodKey).filter(isMonthlyPeriod),
      inscripcionMonto: isNewStudent ? Number(values.inscripcionMonto) : undefined,
      inscripcionPagada: isNewStudent ? values.inscripcionPagada === "SI" : false,
      inscripcionFechaPago: isNewStudent && values.inscripcionPagada === "SI" ? values.inscripcionFechaPago : undefined,
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
          modalidadMensualidad: payload.modalidadMensualidad,
          estado: values.estado,
          fechaInicioPausa: values.estado === "PAUSADO" ? values.fechaInicioPausa || defaultDateValue() : null,
          fechaFinPausa: values.estado === "PAUSADO" && values.pausaModo === "CON_FECHA" ? values.fechaFinPausa : null,
          motivoEstado: values.estado !== "ACTIVO" ? values.motivoEstado.trim() || undefined : null
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
        // Editando, guardar no cierra: los datos personales son el primer paso
        // y todavia quedan mensualidad, estado e historial por revisar.
        if (isEditing) {
          setStep(nextStepAfterSave);
        } else {
          closeCreateModal();
        }
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
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <FiBookOpen className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-700">Directorio</p>
              <h1 className="mt-1 text-[2rem] font-black leading-none text-ink-950 sm:text-[2.25rem]">Alumnos</h1>
              <p className="mt-2 max-w-xl text-sm leading-5 text-ink-500">
                Administra estudiantes, cobros y estado de mensualidad.
              </p>
            </div>
          </div>

          <Button
            className="min-h-10 self-end rounded-xl px-4 py-2.5 text-sm font-bold sm:shrink-0"
            onClick={openCreateModal}
          >
            <FiPlus className="size-4" />
            Agregar alumno
          </Button>
        </header>

        <section className="rounded-[24px] border border-ink-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-ink-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-xl font-black text-ink-950">
                Listado de alumnos <span className="font-semibold text-ink-500">({students.pagination.total})</span>
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Página {students.pagination.page} de {students.pagination.totalPages}
              </p>
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
            <form
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                updateList({ q: query, page: 1 });
              }}
            >
              <label className="relative block min-w-0">
                <span className="sr-only">Buscar alumnos</span>
                <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre, apellido o teléfono"
                  className="field-base h-11 rounded-xl py-2 pl-10 pr-12 text-sm"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-100"
                  title="Buscar"
                  aria-label="Buscar alumnos"
                >
                  <FiSearch className="size-4" />
                </button>
              </label>

              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition focus:outline-none focus:ring-4 focus:ring-brand-100",
                  filtersOpen || activeFilterCount > 0
                    ? "border-brand-200 bg-brand-50 text-brand-700"
                    : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                )}
                aria-expanded={filtersOpen}
                aria-controls="student-filters"
              >
                <FiFilter className="size-4" />
                <span className="hidden min-[360px]:inline">Filtros</span>
                {activeFilterCount > 0 ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
                <FiChevronDown className={cn("size-3.5 transition", filtersOpen && "rotate-180")} />
              </button>
            </form>

            {filtersOpen ? (
              <div id="student-filters" className="mt-4 border-t border-ink-100 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-ink-800">Filtrar alumnos</p>
                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => updateList({ status: "todos", groupId: "", page: 1 })}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-500 transition hover:text-brand-700"
                    >
                      <FiX className="size-4" />
                      Limpiar
                    </button>
                  ) : null}
                </div>

                <label className="relative mt-3 block max-w-sm">
                  <span className="sr-only">Filtrar por grupo</span>
                  <FiUsers className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-brand-600" />
                  <select
                    value={currentGroupId}
                    onChange={(event) => updateList({ groupId: event.target.value, page: 1 })}
                    className="field-base h-11 appearance-none rounded-xl py-2 pl-10 pr-10 text-sm"
                  >
                    <option value="">Todos los grupos</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.nombre}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
                </label>

                <div className="mt-3 grid grid-cols-2 gap-2 min-[380px]:grid-cols-3 lg:flex lg:flex-wrap">
                  {FILTER_OPTIONS.map((option) => {
                    const active = currentFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateList({ status: option.value, page: 1 })}
                        className={cn(
                          "inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition sm:text-sm lg:px-4",
                          active
                            ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                            : "border-ink-200 bg-white text-ink-700 hover:border-brand-200 hover:bg-brand-50"
                        )}
                        aria-pressed={active}
                      >
                        <span className={cn("text-sm", active ? "text-white" : option.iconClass)}>{option.icon}</span>
                        <span className="truncate">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
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
              <div className="grid gap-3 p-4 sm:gap-4 sm:p-6 xl:grid-cols-2">
                {visibleStudents.map((student) => {
                  return (
                    <article
                      key={student.id}
                      className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition hover:border-brand-100 hover:shadow-md"
                    >
                      <button
                        type="button"
                        onClick={() => setDetailStudent(student)}
                        className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset"
                        aria-label={`Ver detalle de ${student.nombre} ${student.apellido}`}
                      >
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-brand-50 text-sm font-bold text-brand-700">
                          {getInitials(student.nombre, student.apellido)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-[15px] font-semibold text-ink-950">
                              {student.nombre} {student.apellido}
                            </h3>
                            <StatusBadge value={student.estado} />
                          </div>
                          <p className="mt-1 truncate text-xs font-medium text-ink-500">
                            {student.group?.nombre ?? "Sin grupo"}
                            {" · "}
                            {student.precioMensualidad
                              ? currency(student.precioMensualidad)
                              : "Usa valor del grupo"}
                          </p>
                        </div>
                        <FiChevronRight className="size-5 shrink-0 text-ink-300" />
                      </button>
                    </article>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 border-t border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-center text-xs font-medium text-ink-500 sm:text-left sm:text-sm">
                  Mostrando {visibleStudents.length} de {students.pagination.total} alumnos
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-10 min-w-0 flex-1 rounded-[14px] px-2 text-xs font-semibold sm:flex-none sm:px-3 sm:text-[13px]"
                    disabled={pagination.page <= 1}
                    onClick={() => updateList({ page: pagination.page - 1 })}
                  >
                    <FiChevronLeft className="size-4" />
                    <span className="truncate">Anterior</span>
                  </Button>
                  <span className="flex shrink-0 items-center justify-center px-1 text-xs font-bold tabular-nums text-ink-700">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-10 min-w-0 flex-1 rounded-[14px] px-2 text-xs font-semibold sm:flex-none sm:px-3 sm:text-[13px]"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => updateList({ page: pagination.page + 1 })}
                  >
                    <span className="truncate">Siguiente</span>
                    <FiChevronRight className="size-4" />
                  </Button>
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
        description={stepProgressLabel(step, registrationType, Boolean(editTarget))}
      >
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-black tracking-tight text-ink-950 sm:text-2xl">{stepTitle(step)}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-ink-500">{stepCopy(step)}</p>
          </div>

          <div className="flex gap-2">
            {Array.from({ length: stepTotal(registrationType, Boolean(editTarget)) }, (_, index) => (
              <div
                key={index}
                className={progressDotClass(index < stepIndex(step, registrationType, Boolean(editTarget)))}
              />
            ))}
          </div>

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
                  <Controller
                    control={control}
                    name="inscripcionMonto"
                    rules={{
                      required: registrationType === "NUEVO" ? "Ingresa el valor de la inscripción" : false
                    }}
                    render={({ field }) => (
                      <MoneyInput
                        name={field.name}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    )}
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
                    <Field label="Fecha de pago de inscripción" error={errors.inscripcionFechaPago?.message}>
                      <input type="date" className="field-base" {...register("inscripcionFechaPago")} />
                    </Field>
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

              <div className="flex gap-3">
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
                  <p className="text-sm font-black text-ink-950">Pago inicial de mensualidad</p>
                  <p className="mt-1 text-sm text-ink-500">
                    Define si el primer periodo de clases ya entro a caja. Si marco que si, se registrara como ingreso.
                  </p>
                </div>

                <DecisionCard
                  title="Si, ya pago la mensualidad inicial"
                  subtitle="Se registrara el primer periodo como pagado y el ingreso entrara a caja."
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
                  title="No ha pagado la mensualidad inicial"
                  subtitle={
                    registrationType === "NUEVO"
                      ? "Se creara el cobro desde su fecha de inicio y quedara pendiente o vencido segun el dia de pago."
                      : "Se creara el cobro del mes actual segun su dia de pago."
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
                    <Field label="Fecha de pago de mensualidad" error={errors.mensualidadFechaPagoActual?.message}>
                      <input type="date" className="field-base" {...register("mensualidadFechaPagoActual")} />
                    </Field>
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

              <div className="flex gap-3">
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Dia de inicio" error={errors.inicioClasesDia?.message}>
                    <select
                      value={startDay}
                      onChange={(event) => {
                        reset(
                          {
                            ...watch(),
                            inicioClasesDia: event.target.value
                          },
                          { keepDirty: true, keepTouched: true }
                        );
                      }}
                      className="field-base h-11 rounded-[18px] text-[14px]"
                    >
                      {startDayOptions.map((day) => (
                        <option key={day} value={day}>
                          Dia {day}
                        </option>
                      ))}
                    </select>
                  </Field>

                </div>

                <Field label="Valor de la mensualidad" error={errors.precioMensualidad?.message}>
                  <Controller
                    control={control}
                    name="precioMensualidad"
                    rules={{ required: "Ingresa la mensualidad" }}
                    render={({ field }) => (
                      <MoneyInput
                        name={field.name}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    )}
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

              <div className="flex gap-3">
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Dia de inicio" error={errors.inicioClasesDia?.message}>
                    <select
                      value={startDay}
                      onChange={(event) => {
                        reset(
                          {
                            ...watch(),
                            inicioClasesDia: event.target.value
                          },
                          { keepDirty: true, keepTouched: true }
                        );
                      }}
                      className="field-base h-11 rounded-[18px] text-[14px]"
                    >
                      {startDayOptions.map((day) => (
                        <option key={day} value={day}>
                          Dia {day}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Mes de inicio" error={errors.inicioClasesMes?.message}>
                    <select
                      value={historyStartMonth}
                      onChange={(event) => {
                        const nextValues = {
                          ...watch(),
                          inicioClasesMes: event.target.value
                        };
                        reset(
                          {
                            ...nextValues,
                            inicioClasesDia: clampDayForMonth(
                              Number(nextValues.inicioClasesDia),
                              Number(nextValues.inicioClasesMes),
                              Number(nextValues.inicioClasesAnio)
                            )
                          },
                          { keepDirty: true, keepTouched: true }
                        );
                      }}
                      className="field-base h-11 rounded-[18px] text-[14px]"
                    >
                      {MONTH_LABELS.map((label, index) => (
                        <option key={label} value={String(index + 1)}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Valor de la mensualidad" error={errors.precioMensualidad?.message}>
                  <Controller
                    control={control}
                    name="precioMensualidad"
                    rules={{ required: "Ingresa la mensualidad" }}
                    render={({ field }) => (
                      <MoneyInput
                        name={field.name}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    )}
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

              <div className="flex gap-3">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={goBackStep}>
                  Atrás
                </Button>
                <Button className="min-h-12 flex-1" type="button" onClick={goNextFromMonthly}>
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}

          {step === "EDIT_BILLING" ? (
            <div className="space-y-5">
              <div className="space-y-4 rounded-[24px] border border-ink-100 bg-ink-50/60 px-4 py-4">
                <div>
                  <p className="text-sm font-black text-ink-950">Configuración de mensualidad</p>
                  <p className="mt-1 text-sm font-medium text-ink-500">
                    Ajusta el valor, la modalidad y el día de cobro del alumno.
                  </p>
                </div>

                <Field label="Valor de la mensualidad" error={errors.precioMensualidad?.message}>
                  <Controller
                    control={control}
                    name="precioMensualidad"
                    rules={{ required: "Ingresa la mensualidad" }}
                    render={({ field }) => (
                      <MoneyInput
                        name={field.name}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    )}
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
            

              <div className="flex gap-3">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={() => setStep("FORM")}>
                  Atrás
                </Button>
                <Button
                  className="min-h-12 flex-1"
                  type="button"
                  loading={isSubmitting}
                  onClick={() => {
                    setNextStepAfterSave("EDIT_STATUS");
                    void submitStudent();
                  }}
                >
                  Guardar y seguir
                </Button>
              </div>
            </div>
          ) : null}

          {step === "EDIT_STATUS" ? (
            <div className="space-y-5">
              <div className="space-y-4 rounded-[24px] border border-ink-100 bg-white px-4 py-4">
                <div>
                  <p className="text-sm font-black text-ink-950">Estado del alumno</p>
                  <p className="mt-1 text-sm font-medium text-ink-500">
                    Pausado conserva el registro sin generar cobros. Desactivado lo saca de cobros nuevos.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <DecisionCard
                    title="Activo"
                    subtitle="Genera cobros normalmente."
                    selected={watch("estado") === "ACTIVO"}
                    onClick={() => reset({ ...watch(), estado: "ACTIVO", motivoEstado: "" }, { keepDirty: true, keepTouched: true })}
                  />
                  <DecisionCard
                    title="Pausado"
                    subtitle="Suspende cobros temporalmente."
                    selected={watch("estado") === "PAUSADO"}
                    onClick={() =>
                      reset(
                        { ...watch(), estado: "PAUSADO", fechaInicioPausa: watch("fechaInicioPausa") || defaultDateValue() },
                        { keepDirty: true, keepTouched: true }
                      )
                    }
                  />
                  <DecisionCard
                    title="Desactivado"
                    subtitle="No genera cobros nuevos."
                    selected={watch("estado") === "DESACTIVADO" || watch("estado") === "INACTIVO"}
                    onClick={() => reset({ ...watch(), estado: "DESACTIVADO" }, { keepDirty: true, keepTouched: true })}
                  />
                </div>
                {watch("estado") === "PAUSADO" ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DecisionCard
                        title="Hasta reactivar"
                        subtitle="Sale de pausa solo cuando la actives manualmente."
                        selected={watch("pausaModo") === "HASTA_REACTIVAR"}
                        onClick={() => reset({ ...watch(), pausaModo: "HASTA_REACTIVAR", fechaFinPausa: "" }, { keepDirty: true, keepTouched: true })}
                      />
                      <DecisionCard
                        title="Con fecha fin"
                        subtitle="La pausa termina en una fecha definida."
                        selected={watch("pausaModo") === "CON_FECHA"}
                        onClick={() => reset({ ...watch(), pausaModo: "CON_FECHA" }, { keepDirty: true, keepTouched: true })}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Inicio pausa">
                        <input type="date" className="field-base" {...register("fechaInicioPausa")} />
                      </Field>
                      {watch("pausaModo") === "CON_FECHA" ? (
                        <Field label="Fin pausa">
                          <input type="date" className="field-base" {...register("fechaFinPausa")} />
                        </Field>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {watch("estado") !== "ACTIVO" ? (
                  <Field label="Motivo">
                    <input className="field-base" {...register("motivoEstado")} />
                  </Field>
                ) : null}
              </div>
            

              <div className="flex gap-3">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={() => setStep("EDIT_BILLING")}>
                  Atrás
                </Button>
                <Button
                  className="min-h-12 flex-1"
                  type="button"
                  loading={isSubmitting}
                  onClick={() => {
                    setNextStepAfterSave("EDIT_HISTORY");
                    void submitStudent();
                  }}
                >
                  Guardar y seguir
                </Button>
              </div>
            </div>
          ) : null}

          {step === "EDIT_HISTORY" && editTarget ? (
            <div className="space-y-5">
              <StudentPaymentHistorySection
                history={paymentHistory}
                loading={paymentHistoryLoading}
                error={paymentHistoryError}
                success={paymentHistorySuccess}
                updatingPaymentId={updatingPaymentId}
                onRetry={() => loadPaymentHistory(editTarget.id)}
                onToggle={updatePaymentHistoryMonth}
              />
            

              <div className="flex gap-3">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={() => setStep("EDIT_STATUS")}>
                  Atrás
                </Button>
                <Button className="min-h-12 flex-1" type="button" onClick={closeCreateModal}>
                  Listo
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

              <div className="flex gap-3">
                <Button className="min-h-12 flex-1" type="button" variant="secondary" onClick={goBackStep}>
                  {editTarget ? "Cancelar" : "Atrás"}
                </Button>
                <Button
                  className="min-h-12 flex-1"
                  type="submit"
                  loading={isSubmitting}
                  onClick={() => setNextStepAfterSave("EDIT_BILLING")}
                >
                  {editTarget ? "Guardar y seguir" : "Guardar alumno"}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(detailStudent)}
        title={detailStudent ? `${detailStudent.nombre} ${detailStudent.apellido}` : ""}
        description={
          detailStudent
            ? `${detailStudent.group?.nombre ?? "Sin grupo"} · ${detailStudent.edad} años`
            : undefined
        }
        onClose={() => setDetailStudent(null)}
      >
        {detailStudent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-brand-50 text-base font-bold text-brand-700">
                {getInitials(detailStudent.nombre, detailStudent.apellido)}
              </div>
              <StatusBadge value={detailStudent.estado} />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <InfoBlock
                label="Mensualidad"
                value={
                  detailStudent.precioMensualidad
                    ? currency(detailStudent.precioMensualidad)
                    : "Usa valor del grupo"
                }
                helper={
                  studentPaymentLabel(detailStudent) === "pendiente"
                    ? "Tiene cobros pendientes o vencidos"
                    : monthlyModeCopy(detailStudent.modalidadMensualidad)
                }
              />
              <InfoBlock
                label="Cobro"
                value={`Día ${detailStudent.diaCobro ?? 10}`}
                helper={monthlyModeCopy(detailStudent.modalidadMensualidad)}
              />
              <InfoBlock
                label="Inscripción"
                value={detailStudent.enrollmentPayment?.estado ?? "Sin inscripción"}
                helper={
                  detailStudent.enrollmentPayment
                    ? currency(detailStudent.enrollmentPayment.monto)
                    : "No aplica"
                }
              />
              <InfoBlock
                label="Contacto"
                value={resolveStudentContact(detailStudent) || "Sin contacto"}
                helper={detailStudent.esMenorDeEdad ? "Acudiente o alumno" : "Teléfono principal"}
                icon={<FiPhone className="size-3.5 text-brand-600" />}
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 flex-1 rounded-xl"
                onClick={() => {
                  const target = detailStudent;
                  setDetailStudent(null);
                  setDeleteTarget(target);
                }}
              >
                Desactivar
              </Button>
              <Button
                type="button"
                className="min-h-11 flex-1 rounded-xl"
                onClick={() => {
                  const target = detailStudent;
                  setDetailStudent(null);
                  openEditModal(target);
                }}
              >
                Editar
              </Button>
            </div>
          </div>
        ) : null}
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
    <div className="min-w-0 rounded-2xl border border-ink-100 bg-ink-50/65 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400 sm:text-[11px]">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        {icon}
        <p className="min-w-0 break-words text-sm font-semibold leading-5 text-ink-950 sm:text-[15px]">{value}</p>
      </div>
      <p className="mt-1 break-words text-[11px] leading-4 text-ink-500 sm:text-xs">{helper}</p>
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
  const today = new Date();
  return {
    estado: "ACTIVO",
    tipoRegistro: "NUEVO",
    pagoMesActual: "NO",
    mensualidadMetodoPagoActual: "EFECTIVO",
    mensualidadFechaPagoActual: defaultDateValue(),
    inscripcionPagada: "NO",
    inscripcionMonto: "",
    inscripcionFechaPago: defaultDateValue(),
    inscripcionMetodoPago: "EFECTIVO",
    modalidadMensualidad: "ANTICIPADA",
    inicioClasesDia: String(Math.min(today.getDate(), 28)),
    inicioClasesMes: String(today.getMonth() + 1),
    inicioClasesAnio: String(today.getFullYear()),
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
    precioMensualidad: "",
    pausaModo: "HASTA_REACTIVAR",
    fechaInicioPausa: defaultDateValue(),
    fechaFinPausa: "",
    motivoEstado: ""
  };
}

function createEditValues(student: StudentListItem): StudentFormValues {
  const startDate = student.fechaInicioClases ? new Date(student.fechaInicioClases) : new Date();
  return {
    estado: student.estado,
    tipoRegistro: student.enrollmentPayment ? "NUEVO" : "ANTIGUO",
    pagoMesActual: currentPayment(student)?.estado === "PAGADO" ? "SI" : "NO",
    mensualidadMetodoPagoActual: currentPayment(student)?.metodoPago ?? "EFECTIVO",
    mensualidadFechaPagoActual: currentPayment(student)?.fechaPago
      ? currentPayment(student)!.fechaPago!.slice(0, 10)
      : defaultDateValue(),
    inscripcionPagada: student.enrollmentPayment?.estado === "PAGADO" ? "SI" : "NO",
    inscripcionMonto: student.enrollmentPayment?.monto ? String(student.enrollmentPayment.monto) : "",
    inscripcionFechaPago: student.enrollmentPayment?.fechaPago
      ? student.enrollmentPayment.fechaPago.slice(0, 10)
      : defaultDateValue(),
    inscripcionMetodoPago: student.enrollmentPayment?.metodoPago ?? "EFECTIVO",
    modalidadMensualidad: student.modalidadMensualidad ?? "ANTICIPADA",
    inicioClasesDia: String(startDate.getDate()),
    inicioClasesMes: String(startDate.getMonth() + 1),
    inicioClasesAnio: String(startDate.getFullYear()),
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
    precioMensualidad: student.precioMensualidad ? String(student.precioMensualidad) : "",
    pausaModo: student.fechaFinPausa ? "CON_FECHA" : "HASTA_REACTIVAR",
    fechaInicioPausa: student.fechaInicioPausa ? student.fechaInicioPausa.slice(0, 10) : defaultDateValue(),
    fechaFinPausa: student.fechaFinPausa ? student.fechaFinPausa.slice(0, 10) : "",
    motivoEstado: student.motivoEstado ?? ""
  };
}

function currentPayment(student: StudentListItem) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return student.monthlyPayments?.find((payment) => payment.mes === month && payment.anio === year);
}

function defaultDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function hasPendingPayment(student: StudentListItem) {
  return student.monthlyPayments?.some((payment) => payment.estado === "PENDIENTE" || payment.estado === "VENCIDO" || payment.estado === "ABONADO") ?? false;
}

function studentPaymentLabel(student: StudentListItem) {
  const payment = currentPayment(student);
  if (payment?.estado === "PAGADO") return "al día";
  if (payment?.estado === "NO_APLICA") return "no aplica";
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

function dayOptionsForMonth(month: number, year: number) {
  const days = month && year ? daysInMonth(year, month) : 31;
  return Array.from({ length: days }, (_, index) => String(index + 1));
}

function clampDayForMonth(day: number, month: number, year: number) {
  return String(Math.min(Math.max(day || 1, 1), month && year ? daysInMonth(year, month) : 31));
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

const EDIT_STEPS: CreateStep[] = ["FORM", "EDIT_BILLING", "EDIT_STATUS", "EDIT_HISTORY"];

function stepSequence(
  registrationType: StudentFormValues["tipoRegistro"],
  isEditing = false
): CreateStep[] {
  if (isEditing) return EDIT_STEPS;

  if (registrationType === "NUEVO") {
    return ["TYPE", "ENROLLMENT", "MONTHLY", "CURRENT_PAYMENT", "FORM"];
  }

  return ["TYPE", "HISTORY", "FORM"];
}

function stepIndex(step: CreateStep, registrationType: StudentFormValues["tipoRegistro"], isEditing = false) {
  const index = stepSequence(registrationType, isEditing).indexOf(step);
  return index >= 0 ? index + 1 : 1;
}

function stepTotal(registrationType: StudentFormValues["tipoRegistro"], isEditing = false) {
  return stepSequence(registrationType, isEditing).length;
}

function stepProgressLabel(
  step: CreateStep,
  registrationType: StudentFormValues["tipoRegistro"],
  isEditing = false
) {
  return `Paso ${stepIndex(step, registrationType, isEditing)} de ${stepTotal(registrationType, isEditing)}`;
}

function stepTitle(step: CreateStep) {
  if (step === "TYPE") return "Tipo de estudiante";
  if (step === "ENROLLMENT") return "Inscripción";
  if (step === "CURRENT_PAYMENT") return "Pago inicial";
  if (step === "MONTHLY") return "Mensualidad";
  if (step === "HISTORY") return "Historial de mensualidades";
  if (step === "EDIT_BILLING") return "Configuración de mensualidad";
  if (step === "EDIT_STATUS") return "Estado del alumno";
  if (step === "EDIT_HISTORY") return "Historial de mensualidades";
  return "Datos personales";
}

function stepCopy(step: CreateStep) {
  if (step === "TYPE") return "Primero define si el alumno llega nuevo a la academia o si ya venía asistiendo.";
  if (step === "ENROLLMENT") {
    return "La inscripción queda separada para que el registro y el cobro sean fáciles de entender.";
  }
  if (step === "CURRENT_PAYMENT") return "Confirma si la primera mensualidad ya fue pagada o si debe quedar por cobrar.";
  if (step === "MONTHLY") {
    return "Define la fecha de inicio, el valor mensual, la modalidad y el dia de cobro que usara el sistema.";
  }
  if (step === "HISTORY") {
    return "Genera los meses desde que empezó clases y marca los que ya están al día.";
  }
  if (step === "EDIT_BILLING") return "Ajusta el valor, la modalidad y el día de cobro del alumno.";
  if (step === "EDIT_STATUS") {
    return "Pausado conserva el registro sin generar cobros. Desactivado lo saca de cobros nuevos.";
  }
  if (step === "EDIT_HISTORY") return "Consulta y actualiza los meses pagados del alumno.";
  return "Completa los datos del alumno, el contacto y el grupo al que pertenece.";
}

function billingStartCopy(
  tipoRegistro: StudentFormValues["tipoRegistro"],
  pagoMesActual: StudentFormValues["pagoMesActual"],
  modalidadMensualidad: StudentFormValues["modalidadMensualidad"]
) {
  const modeCopy = billingModeExplanation(modalidadMensualidad);
  if (pagoMesActual === "SI") {
    return `Como ya pago la mensualidad inicial, ese primer periodo quedara al dia. ${modeCopy}`.trim();
  }

  if (tipoRegistro === "NUEVO") {
    return `Como no ha pagado, el primer cobro se creara desde la fecha de inicio y quedara pendiente o vencido segun su vencimiento. ${modeCopy}`.trim();
  }

  return `Como aun no pago este mes, se creara el cobro del mes actual. Si el dia ya paso, quedara vencido; si es hoy, quedara pendiente. ${modeCopy}`.trim();
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
