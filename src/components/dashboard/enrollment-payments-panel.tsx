"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import {
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiDollarSign,
  FiFilter,
  FiMessageCircle,
  FiSearch,
  FiX
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import {
  PaymentInstallmentModal,
  type InstallmentModalPayment,
  type InstallmentSubmitValues
} from "@/components/ui/payment-installment-modal";
import { PAYMENT_METHODS, PaymentMethodModal, type PaymentMethodValue } from "@/components/ui/payment-method-modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency, formatDate } from "@/lib/web-utils";
import type { EnrollmentPaymentItem } from "@/lib/web-types";

type EnrollmentView = "pending" | "abonables" | "paid";

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];

export function EnrollmentPaymentsPanel({ payments }: { payments: EnrollmentPaymentItem[] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const token = session?.user.apiToken ?? "";
  const [view, setView] = useState<EnrollmentView>("pending");
  const [query, setQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(defaultMonthValue());
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [payTarget, setPayTarget] = useState<EnrollmentPaymentItem | null>(null);
  const [installmentTarget, setInstallmentTarget] = useState<InstallmentModalPayment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>(PAYMENT_METHODS[0].value);
  const [paymentDate, setPaymentDate] = useState(defaultDateValue());
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [submittingInstallment, setSubmittingInstallment] = useState(false);
  const [notifyingPaymentId, setNotifyingPaymentId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const pendingPayments = useMemo(
    () => payments.filter((payment) => payment.estado === "PENDIENTE" || payment.estado === "VENCIDO"),
    [payments]
  );
  const abonablePayments = useMemo(
    () => payments.filter((payment) => payment.estado === "ABONADO" && paymentRemainingAmount(payment) > 0),
    [payments]
  );
  const paidPayments = useMemo(() => payments.filter((payment) => payment.estado === "PAGADO" && payment.fechaPago), [payments]);

  const filteredPending = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return pendingPayments;

    return pendingPayments.filter((payment) =>
      `${payment.student.nombre} ${payment.student.apellido} ${payment.student.group?.nombre ?? ""}`.toLowerCase().includes(term)
    );
  }, [pendingPayments, query]);

  const filteredPaid = useMemo(() => {
    const term = query.trim().toLowerCase();
    const [year, month] = selectedMonth.split("-").map(Number);

    return paidPayments.filter((payment) => {
      const paidDate = payment.fechaPago ? new Date(payment.fechaPago) : null;
      const monthMatches = paidDate ? paidDate.getFullYear() === year && paidDate.getMonth() + 1 === month : false;
      const termMatches = term
        ? `${payment.student.nombre} ${payment.student.apellido} ${payment.student.group?.nombre ?? ""}`.toLowerCase().includes(term)
        : true;

      return monthMatches && termMatches;
    });
  }, [paidPayments, query, selectedMonth]);

  const filteredAbonables = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return abonablePayments;

    return abonablePayments.filter((payment) =>
      `${payment.student.nombre} ${payment.student.apellido} ${payment.student.group?.nombre ?? ""}`.toLowerCase().includes(term)
    );
  }, [abonablePayments, query]);

  const groupedPaid = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        date: Date;
        title: string;
        count: number;
        totalAmount: number;
        items: EnrollmentPaymentItem[];
      }
    >();

    for (const payment of filteredPaid) {
      const date = new Date(payment.fechaPago as string);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          date,
          title: `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`,
          count: 0,
          totalAmount: 0,
          items: []
        });
      }

      const bucket = map.get(key)!;
      bucket.count += 1;
      bucket.totalAmount += Number(payment.monto);
      bucket.items.push(payment);
    }

    return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredPaid]);

  const paidSummary = useMemo(
    () => ({
      totalCount: filteredPaid.length,
      totalAmount: filteredPaid.reduce((sum, payment) => sum + Number(payment.monto), 0)
    }),
    [filteredPaid]
  );

  function openPayModal(payment: EnrollmentPaymentItem) {
    setPaymentMethod(PAYMENT_METHODS[0].value);
    setPaymentDate(defaultDateValue());
    setPayTarget(payment);
  }

  function closePayModal() {
    setPayTarget(null);
    setPaymentMethod(PAYMENT_METHODS[0].value);
    setPaymentDate(defaultDateValue());
  }

  function openInstallmentModal(payment: EnrollmentPaymentItem, mode: "history" | "payment" = "payment") {
    setInstallmentTarget({ ...toInstallmentModalPayment(payment), mode });
  }

  function openPayBalanceModal(payment: EnrollmentPaymentItem) {
    setInstallmentTarget({ ...toInstallmentModalPayment(payment), mode: "payment", prefillRemaining: true });
  }

  function closeInstallmentModal() {
    setInstallmentTarget(null);
  }

  async function payCurrent() {
    if (!payTarget) return;
    setSubmittingPayment(true);

    await clientApiFetch(`/api/enrollment-payments/${payTarget.id}/pay`, token, {
      method: "PUT",
      body: JSON.stringify({ metodoPago: paymentMethod, fechaPago: paymentDate })
    })
      .then(() => {
        sileo.success({ title: "Inscripcion marcada como pagada" });
        closePayModal();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }))
      .finally(() => setSubmittingPayment(false));
  }

  async function saveInstallment(values: InstallmentSubmitValues) {
    if (!installmentTarget) return;
    setSubmittingInstallment(true);

    await clientApiFetch(`/api/enrollment-payments/${installmentTarget.id}/installments`, token, {
      method: "POST",
      body: JSON.stringify(values)
    })
      .then(() => {
        sileo.success({ title: "Abono registrado" });
        closeInstallmentModal();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }))
      .finally(() => setSubmittingInstallment(false));
  }

  function toggleDay(key: string) {
    setCollapsedDays((current) => ({ ...current, [key]: !current[key] }));
  }

  async function notifyByWhatsapp(payment: EnrollmentPaymentItem) {
    setNotifyingPaymentId(payment.id);
    await clientApiFetch<{ whatsappUrl: string }>("/api/reminders/whatsapp", token, {
      method: "POST",
      body: JSON.stringify({ enrollmentPaymentId: payment.id })
    })
      .then((reminder) => {
        window.location.href = reminder.whatsappUrl;
      })
      .catch((error: Error) => {
        sileo.error({ title: "No se pudo generar el WhatsApp", description: error.message });
      })
      .finally(() => setNotifyingPaymentId(null));
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex min-w-0 items-start gap-3 px-1">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <FiDollarSign className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-700">Cobros</p>
            <h1 className="mt-1 text-[1.75rem] font-black leading-none text-ink-950 sm:text-[2rem]">Inscripciones</h1>
            <p className="mt-2 text-sm leading-5 text-ink-500">Consulta saldos pendientes, abonos e inscripciones pagadas.</p>
          </div>
        </header>

        <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:px-6 sm:py-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <label className="relative block min-w-0">
              <span className="sr-only">Buscar inscripción</span>
              <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, apellido o grupo"
                className="field-base h-11 rounded-xl py-2 pl-10 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition focus:outline-none focus:ring-4 focus:ring-brand-100",
                filtersOpen || view !== "pending"
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
              )}
              aria-expanded={filtersOpen}
              aria-controls="enrollment-filters"
            >
              <FiFilter className="size-4" />
              <span className="hidden min-[360px]:inline">Filtros</span>
              {view !== "pending" ? <span className="size-2 rounded-full bg-brand-600" /> : null}
              <FiChevronDown className={cn("size-3.5 transition", filtersOpen && "rotate-180")} />
            </button>
          </div>

          {filtersOpen ? (
            <div id="enrollment-filters" className="mt-4 border-t border-ink-100 pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-ink-800">Estado de inscripción</p>
                {view !== "pending" ? (
                  <button
                    type="button"
                    onClick={() => setView("pending")}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-500 transition hover:text-brand-700"
                  >
                    <FiX className="size-4" />
                    Limpiar
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { value: "pending" as const, label: "Pendientes" },
                  { value: "paid" as const, label: "Pagadas" },
                  { value: "abonables" as const, label: "Abonables" }
                ].map((option) => {
                  const active = view === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setView(option.value)}
                      className={cn(
                        "min-h-10 min-w-0 truncate rounded-xl border px-2 text-[11px] font-semibold transition sm:text-sm",
                        active
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-ink-200 bg-white text-ink-700 hover:border-brand-200 hover:bg-brand-50"
                      )}
                      aria-pressed={active}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {view === "paid" ? (
                <label className="mt-3 block max-w-xs">
                  <span className="mb-2 block text-xs font-bold text-ink-600">Mes de pago</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    className="field-base h-11 rounded-xl py-2 text-sm"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <p className="mt-3 text-xs font-semibold text-ink-500">
            {view === "paid"
              ? `${filteredPaid.length} ${filteredPaid.length === 1 ? "inscripción pagada" : "inscripciones pagadas"}`
              : view === "abonables"
                ? `${filteredAbonables.length} ${filteredAbonables.length === 1 ? "inscripción abonable" : "inscripciones abonables"}`
                : `${filteredPending.length} ${filteredPending.length === 1 ? "inscripción pendiente" : "inscripciones pendientes"}`}
          </p>
        </section>

        {view === "pending" ? (
          <section className="rounded-[24px] border border-ink-100 bg-white shadow-sm">
            <div className="border-b border-ink-100 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-black text-ink-950">Inscripciones pendientes</h2>
              <p className="mt-1 text-sm text-ink-500">
                {filteredPending.length} {filteredPending.length === 1 ? "registro" : "registros"}
              </p>
            </div>

            {filteredPending.length ? (
              <div className="grid gap-3 p-4 sm:gap-4 sm:p-6 lg:grid-cols-2">
                {filteredPending.map((payment) => (
                  <article
                    key={payment.id}
                    className="h-full rounded-2xl border border-ink-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex h-full flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[15px] font-semibold text-ink-950">
                              {payment.student.nombre} {payment.student.apellido}
                            </p>
                            <StatusBadge value={payment.estado} />
                          </div>
                          <p className="mt-1 text-sm text-ink-500">{payment.student.group?.nombre ?? "Sin grupo"} · vence {formatDate(payment.fechaVencimiento)}</p>
                          <p className="mt-2 text-sm font-semibold text-rose-600">{enrollmentDelayCopy(payment)}</p>
                        </div>
                        <p className="shrink-0 text-2xl font-black leading-none text-rose-700">{currency(payment.monto)}</p>
                      </div>

                      <div className="mt-auto grid gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-11 rounded-xl border-brand-200 bg-brand-50 py-2.5 text-[13px] text-brand-700 hover:bg-brand-100"
                          loading={notifyingPaymentId === payment.id}
                          onClick={() => notifyByWhatsapp(payment)}
                        >
                          <FiMessageCircle className="size-4" />
                          Notificar por WhatsApp
                        </Button>
                        <Button type="button" className="min-h-11 rounded-xl py-2.5 text-[13px]" onClick={() => openPayModal(payment)}>
                          <FiCheck className="size-4" />
                          Marcar pagada
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-11 rounded-xl border-amber-200 bg-amber-50 py-2.5 text-[13px] text-amber-700 hover:bg-amber-100"
                          onClick={() => openInstallmentModal(payment)}
                        >
                          <FiDollarSign className="size-4" />
                          Abonar
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-6 py-14 text-center">
                <h3 className="text-lg font-bold text-ink-950">No hay inscripciones pendientes</h3>
                <p className="mt-2 text-sm text-ink-500">{query.trim() ? "Prueba con otro nombre o grupo." : "Todo lo que se ha registrado ya esta al dia."}</p>
              </div>
            )}
          </section>
        ) : view === "abonables" ? (
          <section className="rounded-[24px] border border-sky-100 bg-white shadow-sm">
            <div className="border-b border-sky-100 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-black text-ink-950">Abonables</h2>
              <p className="mt-1 text-sm text-ink-500">
                {filteredAbonables.length} {filteredAbonables.length === 1 ? "inscripcion con abonos activos" : "inscripciones con abonos activos"}
              </p>
            </div>

            {filteredAbonables.length ? (
              <div className="grid gap-3 p-4 sm:gap-4 sm:p-6 lg:grid-cols-2">
                {filteredAbonables.map((payment) => (
                  <article
                    key={payment.id}
                    className="h-full rounded-2xl border border-sky-100 bg-sky-50/50 p-4 shadow-sm"
                  >
                    <div className="flex h-full flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[15px] font-semibold text-ink-950">
                              {payment.student.nombre} {payment.student.apellido}
                            </p>
                            <StatusBadge value={payment.estado} />
                          </div>
                          <p className="mt-1 text-sm text-ink-500">{payment.student.group?.nombre ?? "Sin grupo"} · Inscripcion</p>
                        </div>
                        <p className="shrink-0 text-2xl font-black leading-none text-sky-700">{currency(paymentRemainingAmount(payment))}</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <BalancePill label="Valor total" value={currency(payment.monto)} />
                        <BalancePill label="Total abonado" value={currency(paymentPaidAmount(payment))} />
                        <BalancePill label="Saldo restante" value={currency(paymentRemainingAmount(payment))} highlight />
                      </div>

                      <div className="grid gap-2 text-sm font-semibold text-ink-600 sm:grid-cols-3">
                        <span>{payment.cantidadAbonos ?? payment.installments?.length ?? 0} abono(s)</span>
                        <span>Ultimo metodo: {payment.ultimoMetodoAbono ?? "Sin dato"}</span>
                        <span>Ultimo abono: {payment.fechaUltimoAbono ? formatDate(payment.fechaUltimoAbono) : "Sin fecha"}</span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-11 rounded-xl border-sky-200 bg-white py-2.5 text-[13px] text-sky-700 hover:bg-sky-50"
                          onClick={() => openInstallmentModal(payment, "history")}
                        >
                          Ver historial
                        </Button>
                        <Button type="button" className="min-h-11 rounded-xl py-2.5 text-[13px]" onClick={() => openPayBalanceModal(payment)}>
                          Pagar saldo
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-6 py-14 text-center">
                <h3 className="text-lg font-bold text-ink-950">No hay inscripciones abonables</h3>
                <p className="mt-2 text-sm text-ink-500">Cuando registres un primer abono, aparecera aqui hasta completar el saldo.</p>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-5">
            <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:px-6 sm:py-5">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-400">Historial</p>
              <h2 className="mt-1.5 text-xl font-black text-ink-950">Pagadas con éxito</h2>
              <p className="mt-2 text-sm text-ink-500">
                {paidSummary.totalCount} cobros · {currency(paidSummary.totalAmount)}
              </p>
            </section>

            {groupedPaid.length ? (
              groupedPaid.map((group) => {
                const isCollapsed = Boolean(collapsedDays[group.key]);

                return (
                  <section key={group.key} className="rounded-[24px] border border-ink-100 bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
                      <div>
                        <h3 className="text-lg font-black text-ink-950">{group.title}</h3>
                        <p className="mt-1 text-sm font-semibold text-ink-400">
                          {group.count} {group.count === 1 ? "registro" : "registros"} · {currency(group.totalAmount)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleDay(group.key)}
                        className="rounded-xl p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                        aria-label={isCollapsed ? "Mostrar pagos del dia" : "Ocultar pagos del dia"}
                      >
                        {isCollapsed ? <FiChevronDown className="size-5" /> : <FiChevronUp className="size-5" />}
                      </button>
                    </div>

                    {isCollapsed ? null : (
                      <div className="grid gap-3 border-t border-ink-100 p-4 sm:gap-4 sm:p-6 lg:grid-cols-2">
                        {group.items.map((payment) => (
                          <article
                            key={payment.id}
                            className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-[15px] font-semibold text-ink-950">
                                  {payment.student.nombre} {payment.student.apellido}
                                </p>
                                <p className="mt-1 text-sm text-ink-500">
                                  Inscripcion{payment.student.group?.nombre ? ` · ${payment.student.group.nombre}` : ""}
                                </p>
                              </div>
                              <p className="shrink-0 text-2xl font-black leading-none text-brand-600">{currency(payment.monto)}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })
            ) : (
              <section className="rounded-[24px] border border-ink-100 bg-white px-6 py-14 text-center shadow-sm">
                <h3 className="text-lg font-bold text-ink-950">No hay inscripciones pagadas</h3>
                <p className="mt-2 text-sm text-ink-500">Prueba con otro mes o revisa si ya registraste pagos de inscripcion.</p>
              </section>
            )}
          </section>
        )}
      </div>

      <PaymentMethodModal
        open={Boolean(payTarget)}
        title="Marcar inscripcion como pagada"
        description={`Registrarás el pago de la inscripción de ${payTarget?.student.nombre} ${payTarget?.student.apellido}.`}
        amount={payTarget?.monto ?? null}
        notice="Confirma este pago solo si ya recibiste el dinero de la inscripcion y quieres dejarlo registrado en caja."
        paymentDate={paymentDate}
        selectedMethod={paymentMethod}
        confirmText="Confirmar pago"
        loading={submittingPayment}
        onClose={closePayModal}
        onConfirm={payCurrent}
        onChangePaymentDate={setPaymentDate}
        onSelectMethod={setPaymentMethod}
      />

      <PaymentInstallmentModal
        open={Boolean(installmentTarget)}
        payment={installmentTarget}
        loading={submittingInstallment}
        onClose={closeInstallmentModal}
        onSubmit={saveInstallment}
      />
    </div>
  );
}

function defaultMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function defaultDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function BalancePill({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-[18px] border px-4 py-3", highlight ? "border-amber-100 bg-amber-50" : "border-white bg-white/80")}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-400">{label}</p>
      <p className="mt-2 text-base font-black text-ink-950">{value}</p>
    </div>
  );
}

function paymentPaidAmount(payment: EnrollmentPaymentItem) {
  if (payment.montoAbonado !== undefined && payment.montoAbonado !== null) return Number(payment.montoAbonado);
  return payment.installments?.reduce((sum, installment) => sum + Number(installment.monto), 0) ?? 0;
}

function paymentRemainingAmount(payment: EnrollmentPaymentItem) {
  if (payment.saldoPendiente !== undefined && payment.saldoPendiente !== null) return Number(payment.saldoPendiente);
  return Math.max(Number(payment.monto ?? 0) - paymentPaidAmount(payment), 0);
}

function toInstallmentModalPayment(payment: EnrollmentPaymentItem): InstallmentModalPayment {
  return {
    id: payment.id,
    kind: "ENROLLMENT_PAYMENT",
    studentName: `${payment.student.nombre} ${payment.student.apellido}`,
    concept: "Inscripcion",
    totalAmount: Number(payment.monto ?? 0),
    paidAmount: paymentPaidAmount(payment),
    remainingAmount: paymentRemainingAmount(payment),
    installmentCount: payment.cantidadAbonos ?? payment.installments?.length ?? 0,
    lastMethod: payment.ultimoMetodoAbono,
    lastDate: payment.fechaUltimoAbono,
    installments: payment.installments ?? []
  };
}

function enrollmentDelayCopy(payment: EnrollmentPaymentItem) {
  const overdueDays = calculateOverdueDays(payment.fechaVencimiento);
  return overdueDays > 0 ? `Lleva ${overdueDays} dia${overdueDays === 1 ? "" : "s"} vencida` : "Vence hoy";
}

function calculateOverdueDays(date: string) {
  const dueDate = new Date(date);
  const now = new Date();
  const dueUtc = Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((nowUtc - dueUtc) / 86400000));
}
