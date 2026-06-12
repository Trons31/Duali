"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { FiCheck, FiChevronDown, FiChevronUp, FiDollarSign, FiMessageCircle, FiSearch } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { NoAplicaMonthlyPaymentModal, type NoAplicaMonthlyPaymentTarget } from "@/components/ui/no-aplica-monthly-payment-modal";
import {
  PaymentInstallmentModal,
  type InstallmentModalPayment,
  type InstallmentSubmitValues
} from "@/components/ui/payment-installment-modal";
import { PAYMENT_METHODS, PaymentMethodModal, type PaymentMethodValue } from "@/components/ui/payment-method-modal";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency, formatDate } from "@/lib/web-utils";
import type { PaymentInstallmentItem } from "@/lib/web-types";

type DuePayment = {
  id: string;
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  monto: number | string;
  montoAbonado?: number | string;
  saldoPendiente?: number | string;
  cantidadAbonos?: number;
  fechaVencimiento: string;
  estado?: "PENDIENTE" | "ABONADO" | "PAGADO" | "VENCIDO" | "NO_APLICA";
  ultimoMetodoAbono?: string | null;
  fechaUltimoAbono?: string | null;
  installments?: PaymentInstallmentItem[];
  mes?: number | null;
  anio?: number | null;
  student: {
    id?: string;
    nombre: string;
    apellido: string;
    celular?: string | null;
    telefonoPadre?: string | null;
    esMenorDeEdad?: boolean;
  };
  group?: {
    nombre: string;
  } | null;
};

type PaymentCard = {
  key: string;
  items: DuePayment[];
  primaryItem: DuePayment;
  totalAmount: number;
  displayStatus: PaymentDisplayStatus;
  oldestDueDate: string;
  isConsolidated: boolean;
};

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

type PaymentDisplayStatus = "PAGADO" | "ABONADO" | "VENCIDO" | "PENDIENTE_HOY" | "PROXIMO_A_VENCER";

export function DuePaymentsPanel({
  items,
  titleAction
}: {
  items: DuePayment[];
  titleAction: "pendiente" | "vencido";
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [payTarget, setPayTarget] = useState<PaymentCard | null>(null);
  const [installmentTarget, setInstallmentTarget] = useState<InstallmentModalPayment | null>(null);
  const [noAplicaTarget, setNoAplicaTarget] = useState<DuePayment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>(PAYMENT_METHODS[0].value);
  const [paymentDate, setPaymentDate] = useState(defaultDateValue());
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [submittingInstallment, setSubmittingInstallment] = useState(false);
  const [submittingNoAplica, setSubmittingNoAplica] = useState(false);
  const [notifyingCardKey, setNotifyingCardKey] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [query, setQuery] = useState("");
  const token = session?.user.apiToken ?? "";

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;

    return items.filter((item) => {
      const searchable = [
        item.student.nombre,
        item.student.apellido,
        item.group?.nombre ?? "",
        paymentConceptLabel(item)
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [items, query]);

  const paymentCards = useMemo(() => {
    const collectibleItems = filteredItems.filter((item) => !isAbonablePayment(item));
    if (titleAction === "vencido") return groupOverduePaymentCards(collectibleItems);
    return collectibleItems.map(createSinglePaymentCard);
  }, [filteredItems, titleAction]);

  const abonableItems = useMemo(() => filteredItems.filter(isAbonablePayment).map(createSinglePaymentCard), [filteredItems]);

  function openPayModal(card: PaymentCard) {
    setPaymentMethod(PAYMENT_METHODS[0].value);
    setPaymentDate(defaultDateValue());
    setPayTarget(card);
  }

  function closePayModal() {
    setPayTarget(null);
    setPaymentMethod(PAYMENT_METHODS[0].value);
    setPaymentDate(defaultDateValue());
  }

  function openInstallmentModal(item: DuePayment, mode: "history" | "payment" = "payment") {
    setInstallmentTarget({ ...toInstallmentModalPayment(item), mode });
  }

  function openPayBalanceModal(item: DuePayment) {
    setInstallmentTarget({ ...toInstallmentModalPayment(item), mode: "payment", prefillRemaining: true });
  }

  function closeInstallmentModal() {
    setInstallmentTarget(null);
  }

  async function payCurrent() {
    if (!payTarget) return;
    setSubmittingPayment(true);
    await Promise.all(
      payTarget.items.map((item) => {
        const endpoint =
          item.kind === "MONTHLY_PAYMENT"
            ? `/api/monthly-payments/${item.id}/pay`
            : `/api/enrollment-payments/${item.id}/pay`;

        return clientApiFetch(endpoint, token, {
          method: "PUT",
          body: JSON.stringify({ metodoPago: paymentMethod, fechaPago: paymentDate })
        });
      })
    )
      .then(() => {
        sileo.success({
          title:
            payTarget.items.length === 1
              ? "Cobro registrado como pagado"
              : `${payTarget.items.length} cobros registrados como pagados`
        });
        closePayModal();
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }))
      .finally(() => setSubmittingPayment(false));
  }

  async function saveInstallment(values: InstallmentSubmitValues) {
    if (!installmentTarget) return;

    const endpoint =
      installmentTarget.kind === "MONTHLY_PAYMENT"
        ? `/api/monthly-payments/${installmentTarget.id}/installments`
        : `/api/enrollment-payments/${installmentTarget.id}/installments`;

    setSubmittingInstallment(true);
    await clientApiFetch(endpoint, token, {
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

  async function editInstallment(installmentId: string, values: InstallmentSubmitValues) {
    if (!installmentTarget || installmentTarget.kind !== "MONTHLY_PAYMENT") return;

    await clientApiFetch<{ payment: DuePayment }>(
      `/api/monthly-payments/${installmentTarget.id}/installments/${installmentId}`,
      token,
      { method: "PATCH", body: JSON.stringify(values) }
    )
      .then(({ payment }) => {
        sileo.success({ title: "Abono actualizado" });
        setInstallmentTarget({ ...toInstallmentModalPayment({ ...payment, kind: "MONTHLY_PAYMENT" }), mode: "history" });
        router.refresh();
      })
      .catch((error: Error) => {
        sileo.error({ title: error.message });
        throw error;
      });
  }

  async function deleteInstallment(installmentId: string) {
    if (!installmentTarget || installmentTarget.kind !== "MONTHLY_PAYMENT") return;

    await clientApiFetch<{ payment: DuePayment }>(
      `/api/monthly-payments/${installmentTarget.id}/installments/${installmentId}`,
      token,
      { method: "DELETE" }
    )
      .then(({ payment }) => {
        sileo.success({ title: "Abono eliminado" });
        if (payment.installments?.length) {
          setInstallmentTarget({ ...toInstallmentModalPayment({ ...payment, kind: "MONTHLY_PAYMENT" }), mode: "history" });
        } else {
          closeInstallmentModal();
        }
        router.refresh();
      })
      .catch((error: Error) => {
        sileo.error({ title: error.message });
        throw error;
      });
  }

  async function notifyByWhatsapp(card: PaymentCard) {
    const monthlyPaymentIds = card.items
      .filter((item) => item.kind === "MONTHLY_PAYMENT")
      .map((item) => item.id);
    const enrollmentPaymentIds = card.items
      .filter((item) => item.kind === "ENROLLMENT_PAYMENT")
      .map((item) => item.id);

    setNotifyingCardKey(card.key);
    await clientApiFetch<{ whatsappUrl: string }>("/api/reminders/whatsapp", token, {
      method: "POST",
      body: JSON.stringify({ monthlyPaymentIds, enrollmentPaymentIds })
    })
      .then((reminder) => {
        window.location.href = reminder.whatsappUrl;
      })
      .catch((error: Error) => {
        sileo.error({ title: "No se pudo generar el WhatsApp", description: error.message });
      })
      .finally(() => setNotifyingCardKey(null));
  }

  async function markNoAplica(values: { motivo: string; fechaProximoCobro?: string }) {
    if (!noAplicaTarget || noAplicaTarget.kind !== "MONTHLY_PAYMENT") return;

    setSubmittingNoAplica(true);
    await clientApiFetch(`/api/monthly-payments/${noAplicaTarget.id}/no-aplica`, token, {
      method: "PUT",
      body: JSON.stringify(values)
    })
      .then(() => {
        sileo.success({ title: "Cobro marcado como No aplica" });
        setNoAplicaTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }))
      .finally(() => setSubmittingNoAplica(false));
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-white px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft sm:px-6 sm:py-6">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-400">Cobranza</p>
              <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-ink-950 sm:text-[2.2rem]">
                {titleAction === "pendiente" ? "Pendientes" : "Vencidos"}
              </h1>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-black text-ink-950">Buscar alumno</p>
                <p className="mt-1 text-sm text-ink-500">Busca por nombre, apellido o grupo.</p>
              </div>

              <div className="relative">
                <FiSearch className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nombre, apellido o grupo"
                  className="field-base h-11 rounded-[18px] pl-11 text-[14px]"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink-100 bg-white shadow-soft">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-bold text-ink-950">
                Cobros {titleAction === "pendiente" ? "pendientes" : "vencidos"}
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                {paymentCards.length}{" "}
                {titleAction === "vencido"
                  ? paymentCards.length === 1
                    ? "estudiante con deuda"
                    : "estudiantes con deuda"
                  : paymentCards.length === 1
                    ? "registro"
                    : "registros"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setResultsOpen((current) => !current)}
              className="rounded-full p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
              aria-label={resultsOpen ? "Ocultar resultados" : "Mostrar resultados"}
            >
              {resultsOpen ? <FiChevronUp className="size-6" /> : <FiChevronDown className="size-6" />}
            </button>
          </div>

          {resultsOpen ? (
            paymentCards.length ? (
              <div className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6">
                {paymentCards.map((card) => {
                  const item = card.primaryItem;
                  const displayStatus = card.displayStatus;
                  const isOverdue = displayStatus === "VENCIDO";

                  return (
                  <article
                    key={card.key}
                    className={cn(
                      "rounded-[28px] border px-5 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)]",
                      isOverdue ? "border-rose-100 bg-rose-50/60" : "border-ink-100 bg-white"
                    )}
                  >
                    <div className="space-y-5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[15px] font-semibold text-ink-950">
                            {item.student.nombre} {item.student.apellido}
                          </p>
                          <span className={statusBadgeClassName(displayStatus)}>{paymentStatusLabel(displayStatus)}</span>
                        </div>
                        <p className="mt-1 text-sm text-ink-500">{paymentCardSummary(card)}</p>
                        {isOverdue ? (
                          <p className="mt-2 text-sm font-semibold text-rose-600">
                            {card.isConsolidated
                              ? `Deuda mas antigua: ${overdueAgeText(card.oldestDueDate)}`
                              : overdueAgeText(item.fechaVencimiento)}
                          </p>
                        ) : null}
                        {card.isConsolidated ? (
                          <div className="mt-4 overflow-hidden rounded-[18px] border border-rose-100 bg-white">
                            {card.items.map((payment) => (
                              <div
                                key={`${payment.kind}-${payment.id}`}
                                className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-rose-50 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_140px_96px]"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-ink-900">{paymentConceptCopy(payment)}</p>
                                  <p className="mt-1 text-xs font-semibold text-ink-400">Vence {formatDate(payment.fechaVencimiento)}</p>
                                </div>
                                <span className="text-right text-sm font-black text-ink-950">{currency(paymentRemainingAmount(payment))}</span>
                                <div className="col-span-2 grid gap-2 sm:col-span-1">
                                  <button
                                    type="button"
                                    onClick={() => openInstallmentModal(payment)}
                                    className="h-10 rounded-[14px] border border-brand-200 bg-brand-50 px-4 text-sm font-black text-brand-700 transition hover:bg-brand-100"
                                  >
                                    Abonar
                                  </button>
                                  {canMarkNoAplica(payment) ? (
                                    <button
                                      type="button"
                                      onClick={() => setNoAplicaTarget(payment)}
                                      className="h-10 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                                    >
                                      No aplica
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <p className={cn("mt-4 text-[1.9rem] font-black tracking-tight", amountClassName(displayStatus))}>
                          {currency(card.totalAmount)}
                        </p>
                      </div>

                      <div className="grid gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-14 rounded-[22px] border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                          loading={notifyingCardKey === card.key}
                          onClick={() => notifyByWhatsapp(card)}
                        >
                          <FiMessageCircle className="size-5" />
                          Notificar por WhatsApp
                        </Button>
                        {!card.isConsolidated ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="min-h-14 rounded-[22px] border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            onClick={() => openInstallmentModal(item)}
                          >
                            <FiDollarSign className="size-5" />
                            Abonar
                          </Button>
                        ) : null}
                        {!card.isConsolidated && canMarkNoAplica(item) ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="min-h-14 rounded-[22px] border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            onClick={() => setNoAplicaTarget(item)}
                          >
                            No aplica
                          </Button>
                        ) : null}
                        <Button type="button" className="min-h-14 rounded-[22px]" onClick={() => openPayModal(card)}>
                          <FiCheck className="size-5" />
                          Marcar pagado
                        </Button>
                      </div>
                    </div>
                  </article>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-14 text-center">
                <h3 className="text-lg font-bold text-ink-950">No encontramos cobros</h3>
                <p className="mt-2 text-sm text-ink-500">
                  {query.trim()
                    ? "Intenta con otro nombre, apellido o grupo."
                    : titleAction === "pendiente"
                      ? "Todo lo programado para hoy ya esta al dia."
                      : "No hay cobros vencidos en este momento."}
                </p>
              </div>
            )
          ) : null}
        </section>

        <section className="rounded-[28px] border border-sky-100 bg-white shadow-soft">
          <div className="border-b border-sky-100 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-bold text-ink-950">Abonables</h2>
            <p className="mt-1 text-sm text-ink-500">
              {abonableItems.length} {abonableItems.length === 1 ? "pago con abonos activos" : "pagos con abonos activos"}
            </p>
          </div>

          {abonableItems.length ? (
            <div className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6">
              {abonableItems.map((card) => {
                const item = card.primaryItem;

                return (
                  <article
                    key={`abonable-${card.key}`}
                    className="rounded-[28px] border border-sky-100 bg-sky-50/50 px-5 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
                  >
                    <div className="space-y-5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[15px] font-semibold text-ink-950">
                            {item.student.nombre} {item.student.apellido}
                          </p>
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-black text-sky-700">
                            Pago por abono
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-ink-500">{paymentConceptCopy(item)}</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <MiniAmount label="Valor total" value={currency(item.monto)} />
                        <MiniAmount label="Total abonado" value={currency(paymentPaidAmount(item))} />
                        <MiniAmount label="Saldo restante" value={currency(paymentRemainingAmount(item))} highlight />
                      </div>

                      <div className="grid gap-2 text-sm font-semibold text-ink-600 sm:grid-cols-3">
                        <span>{item.cantidadAbonos ?? item.installments?.length ?? 0} abono(s)</span>
                        <span>Ultimo metodo: {item.ultimoMetodoAbono ?? "Sin dato"}</span>
                        <span>Ultimo abono: {item.fechaUltimoAbono ? formatDate(item.fechaUltimoAbono) : "Sin fecha"}</span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-14 rounded-[22px] border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
                          onClick={() => openInstallmentModal(item, "history")}
                        >
                          Ver historial
                        </Button>
                        <Button
                          type="button"
                          className="min-h-14 rounded-[22px]"
                          onClick={() => openPayBalanceModal(item)}
                        >
                          Pagar saldo
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-10 text-center">
              <h3 className="text-lg font-bold text-ink-950">No hay pagos abonables</h3>
              <p className="mt-2 text-sm text-ink-500">Cuando registres un primer abono, aparecera aqui hasta completar el saldo.</p>
            </div>
          )}
        </section>
      </div>

      <PaymentMethodModal
        open={Boolean(payTarget)}
        title={
          payTarget?.isConsolidated
            ? "Marcar deuda como pagada"
            : `Marcar ${paymentConceptLabel(payTarget?.primaryItem ?? ({ kind: "MONTHLY_PAYMENT" } as DuePayment))} como pagada`
        }
        description={
          payTarget
            ? `Confirmaras el pago de ${payTarget.primaryItem.student.nombre} ${payTarget.primaryItem.student.apellido}.`
            : ""
        }
        amount={payTarget?.totalAmount ?? null}
        notice={
          payTarget?.isConsolidated
            ? `Marca como pagado solo si ya recibiste el dinero de estos ${payTarget.items.length} cobros.`
            : `Marca como pagado solo si ya recibiste el dinero de esta ${paymentConceptLabel(payTarget?.primaryItem ?? ({ kind: "MONTHLY_PAYMENT" } as DuePayment))}.`
        }
        paymentDate={paymentDate}
        selectedMethod={paymentMethod}
        confirmText="Confirmar pago"
        loading={submittingPayment}
        onClose={closePayModal}
        onConfirm={payCurrent}
        onChangePaymentDate={setPaymentDate}
        onSelectMethod={setPaymentMethod}
      />

      <NoAplicaMonthlyPaymentModal
        open={Boolean(noAplicaTarget)}
        target={toNoAplicaTarget(noAplicaTarget)}
        loading={submittingNoAplica}
        onClose={() => setNoAplicaTarget(null)}
        onConfirm={markNoAplica}
      />

      <PaymentInstallmentModal
        open={Boolean(installmentTarget)}
        payment={installmentTarget}
        loading={submittingInstallment}
        onClose={closeInstallmentModal}
        onSubmit={saveInstallment}
        onEditInstallment={installmentTarget?.kind === "MONTHLY_PAYMENT" ? editInstallment : undefined}
        onDeleteInstallment={installmentTarget?.kind === "MONTHLY_PAYMENT" ? deleteInstallment : undefined}
      />
    </div>
  );
}

function defaultDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function createSinglePaymentCard(item: DuePayment): PaymentCard {
  return {
    key: `${item.kind}-${item.id}`,
    items: [item],
    primaryItem: item,
    totalAmount: paymentRemainingAmount(item),
    displayStatus: resolvePaymentDisplayStatus(item),
    oldestDueDate: item.fechaVencimiento,
    isConsolidated: false
  };
}

function toNoAplicaTarget(item: DuePayment | null): NoAplicaMonthlyPaymentTarget | null {
  if (!item) return null;
  return {
    id: item.id,
    studentName: `${item.student.nombre} ${item.student.apellido}`,
    concept: paymentConceptCopy(item),
    amount: item.monto
  };
}

function groupOverduePaymentCards(items: DuePayment[]) {
  const groups = new Map<string, DuePayment[]>();

  items.forEach((item) => {
    const key = studentGroupKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });

  return Array.from(groups.entries())
    .map(([key, groupItems]) => {
      const sortedItems = [...groupItems].sort(
        (a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime()
      );
      const primaryItem = sortedItems[0]!;

      return {
        key,
        items: sortedItems,
        primaryItem,
        totalAmount: sortedItems.reduce((total, item) => total + paymentRemainingAmount(item), 0),
        displayStatus: "VENCIDO" as PaymentDisplayStatus,
        oldestDueDate: primaryItem.fechaVencimiento,
        isConsolidated: sortedItems.length > 1
      };
    })
    .sort((a, b) => new Date(a.oldestDueDate).getTime() - new Date(b.oldestDueDate).getTime());
}

function MiniAmount({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-[18px] border px-4 py-3", highlight ? "border-amber-100 bg-amber-50" : "border-white bg-white/80")}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-400">{label}</p>
      <p className="mt-2 text-base font-black text-ink-950">{value}</p>
    </div>
  );
}

function isAbonablePayment(item: DuePayment) {
  return item.estado === "ABONADO" && paymentRemainingAmount(item) > 0;
}

function canMarkNoAplica(item: DuePayment) {
  return item.kind === "MONTHLY_PAYMENT" && item.estado !== "PAGADO" && item.estado !== "NO_APLICA" && Number(item.montoAbonado ?? 0) === 0;
}

function paymentPaidAmount(item: DuePayment) {
  if (item.montoAbonado !== undefined && item.montoAbonado !== null) return Number(item.montoAbonado);
  return item.installments?.reduce((sum, installment) => sum + Number(installment.monto), 0) ?? 0;
}

function paymentRemainingAmount(item: DuePayment) {
  if (item.saldoPendiente !== undefined && item.saldoPendiente !== null) return Number(item.saldoPendiente);
  return Math.max(Number(item.monto ?? 0) - paymentPaidAmount(item), 0);
}

function toInstallmentModalPayment(item: DuePayment): InstallmentModalPayment {
  return {
    id: item.id,
    kind: item.kind,
    studentName: `${item.student.nombre} ${item.student.apellido}`,
    concept: paymentConceptCopy(item),
    totalAmount: Number(item.monto ?? 0),
    paidAmount: paymentPaidAmount(item),
    remainingAmount: paymentRemainingAmount(item),
    installmentCount: item.cantidadAbonos ?? item.installments?.length ?? 0,
    lastMethod: item.ultimoMetodoAbono,
    lastDate: item.fechaUltimoAbono,
    installments: item.installments ?? []
  };
}

function studentGroupKey(item: DuePayment) {
  return (
    item.student.id ??
    [
      item.student.nombre,
      item.student.apellido,
      item.student.celular ?? "",
      item.student.telefonoPadre ?? ""
    ]
      .join("-")
      .toLowerCase()
  );
}

function paymentConceptLabel(item: DuePayment) {
  return item.kind === "MONTHLY_PAYMENT" ? "mensualidad" : "inscripción";
}

function paymentCardSummary(card: PaymentCard) {
  if (!card.isConsolidated) return paymentDateCopy(card.primaryItem, card.displayStatus);

  const monthlyItems = card.items.filter((item) => item.kind === "MONTHLY_PAYMENT");
  const otherItems = card.items.length - monthlyItems.length;
  const parts = [
    monthlyItems.length
      ? `${monthlyItems.length} ${monthlyItems.length === 1 ? "mensualidad vencida" : "mensualidades vencidas"}`
      : "",
    otherItems ? `${otherItems} ${otherItems === 1 ? "otro cobro vencido" : "otros cobros vencidos"}` : ""
  ].filter(Boolean);

  return `${parts.join(" y ")}: ${card.items.map(paymentConceptCopy).join(", ")}`;
}

function paymentConceptCopy(item: DuePayment) {
  if (item.kind === "MONTHLY_PAYMENT" && item.mes && item.anio) {
    const monthName = MONTH_NAMES[item.mes - 1] ?? String(item.mes);
    return `${capitalize(monthName)} ${item.anio}`;
  }

  return `Inscripcion vencida el ${formatDate(item.fechaVencimiento)}`;
}

function paymentDateCopy(item: DuePayment, status: PaymentDisplayStatus) {
  const dueCopy = formatDate(item.fechaVencimiento);
  const verb = status === "VENCIDO" ? "venció" : "vence";

  if (item.kind === "MONTHLY_PAYMENT" && item.mes && item.anio) {
    const monthName = MONTH_NAMES[item.mes - 1] ?? String(item.mes);
    const concept = `${capitalize(monthName)} ${item.anio}`;

    if (status === "PENDIENTE_HOY") return `${concept} vence hoy`;
    return `${concept} ${verb} el ${dueCopy}`;
  }

  if (status === "PENDIENTE_HOY") return `Inscripción vence hoy`;
  return `Inscripción ${verb} el ${dueCopy}`;
}

function amountClassName(status: PaymentDisplayStatus) {
  if (status === "ABONADO") return "text-sky-700";
  return status === "VENCIDO" ? "text-rose-700" : "text-brand-600";
}

function resolvePaymentDisplayStatus(item: DuePayment): PaymentDisplayStatus {
  if (item.estado === "PAGADO") return "PAGADO";
  if (item.estado === "ABONADO") return "ABONADO";

  const dueDate = startOfLocalCalendarDay(new Date(item.fechaVencimiento));
  const today = startOfLocalCalendarDay(new Date());

  if (dueDate.getTime() < today.getTime() || item.estado === "VENCIDO") return "VENCIDO";
  if (dueDate.getTime() === today.getTime()) return "PENDIENTE_HOY";
  return "PROXIMO_A_VENCER";
}

function paymentStatusLabel(status: PaymentDisplayStatus) {
  if (status === "PAGADO") return "Pagado";
  if (status === "ABONADO") return "Pago por abono";
  if (status === "VENCIDO") return "Vencido";
  if (status === "PENDIENTE_HOY") return "Pendiente";
  return "Próximo a vencer";
}

function statusBadgeClassName(status: PaymentDisplayStatus) {
  return cn(
    "rounded-full px-2.5 py-1 text-[11px] font-black",
    status === "VENCIDO"
      ? "bg-rose-100 text-rose-700"
      : status === "ABONADO"
        ? "bg-sky-100 text-sky-700"
        : "bg-amber-100 text-amber-700"
  );
}

function overdueAgeText(date: string) {
  const elapsedDays = overdueDays(date);
  const dueDate = new Date(date);
  const dueMonthDays = daysInMonth(dueDate.getFullYear(), dueDate.getMonth());

  if (elapsedDays <= dueMonthDays) {
    return `Venció hace ${plural(elapsedDays, "día", "días")}`;
  }

  let months = 1;
  let remainingDays = elapsedDays - dueMonthDays - 1;
  let cursorMonth = dueDate.getMonth() + 1;
  let cursorYear = dueDate.getFullYear();
  if (cursorMonth > 11) {
    cursorMonth = 0;
    cursorYear += 1;
  }

  while (remainingDays > daysInMonth(cursorYear, cursorMonth)) {
    remainingDays -= daysInMonth(cursorYear, cursorMonth);
    months += 1;
    cursorMonth += 1;

    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear += 1;
    }
  }

  const monthCopy = plural(months, "mes", "meses");
  if (remainingDays <= 0) return `Venció hace ${monthCopy}`;

  return `Venció hace ${monthCopy} y ${plural(remainingDays, "día", "días")}`;
}

function overdueDays(date: string) {
  const dueDate = new Date(date);
  const now = new Date();
  const dueUtc = Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((nowUtc - dueUtc) / 86400000));
}

function startOfLocalCalendarDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function plural(value: number, singular: string, pluralText: string) {
  return `${value} ${value === 1 ? singular : pluralText}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
