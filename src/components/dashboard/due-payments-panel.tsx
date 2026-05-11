"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { FiCheck, FiChevronDown, FiChevronUp, FiMessageCircle, FiSearch } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHODS, PaymentMethodModal, type PaymentMethodValue } from "@/components/ui/payment-method-modal";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency, formatDate } from "@/lib/web-utils";

type DuePayment = {
  id: string;
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  monto: number | string;
  fechaVencimiento: string;
  estado?: "PENDIENTE" | "PAGADO" | "VENCIDO";
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

type PaymentDisplayStatus = "PAGADO" | "VENCIDO" | "PENDIENTE_HOY" | "PROXIMO_A_VENCER";

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>(PAYMENT_METHODS[0].value);
  const [submittingPayment, setSubmittingPayment] = useState(false);
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
    if (titleAction === "vencido") return groupOverduePaymentCards(filteredItems);
    return filteredItems.map(createSinglePaymentCard);
  }, [filteredItems, titleAction]);

  function openPayModal(card: PaymentCard) {
    setPaymentMethod(PAYMENT_METHODS[0].value);
    setPayTarget(card);
  }

  function closePayModal() {
    setPayTarget(null);
    setPaymentMethod(PAYMENT_METHODS[0].value);
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
          body: JSON.stringify({ metodoPago: paymentMethod })
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

  async function notifyByWhatsapp(card: PaymentCard) {
    const recipient = resolveWhatsappRecipient(card.primaryItem);
    if (!recipient.phone) {
      sileo.error({
        title: "Sin WhatsApp disponible",
        description: "Este alumno no tiene numero registrado para enviar recordatorio."
      });
      return;
    }

    const message = createWhatsappPaymentMessage(card, recipient.isGuardian);
    const url = `https://wa.me/${recipient.phone}?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank", "noopener,noreferrer");
    sileo.success({ title: "WhatsApp listo", description: "Abrimos el recordatorio en una pestaña nueva." });
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
                          <div className="mt-4 space-y-2 rounded-[22px] border border-rose-100 bg-white/70 px-4 py-4">
                            {card.items.map((payment) => (
                              <div
                                key={`${payment.kind}-${payment.id}`}
                                className="flex items-center justify-between gap-3 text-sm"
                              >
                                <span className="font-semibold text-ink-700">{paymentConceptCopy(payment)}</span>
                                <span className="shrink-0 font-black text-ink-950">{currency(payment.monto)}</span>
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
                          onClick={() => notifyByWhatsapp(card)}
                        >
                          <FiMessageCircle className="size-5" />
                          Notificar por WhatsApp
                        </Button>
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
        selectedMethod={paymentMethod}
        confirmText="Confirmar pago"
        loading={submittingPayment}
        onClose={closePayModal}
        onConfirm={payCurrent}
        onSelectMethod={setPaymentMethod}
      />
    </div>
  );
}

function createSinglePaymentCard(item: DuePayment): PaymentCard {
  return {
    key: `${item.kind}-${item.id}`,
    items: [item],
    primaryItem: item,
    totalAmount: Number(item.monto ?? 0),
    displayStatus: resolvePaymentDisplayStatus(item),
    oldestDueDate: item.fechaVencimiento,
    isConsolidated: false
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
        totalAmount: sortedItems.reduce((total, item) => total + Number(item.monto ?? 0), 0),
        displayStatus: "VENCIDO" as PaymentDisplayStatus,
        oldestDueDate: primaryItem.fechaVencimiento,
        isConsolidated: sortedItems.length > 1
      };
    })
    .sort((a, b) => new Date(a.oldestDueDate).getTime() - new Date(b.oldestDueDate).getTime());
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

function resolveWhatsappRecipient(item: DuePayment) {
  const rawPhone = item.student.telefonoPadre || item.student.celular || "";
  const digits = rawPhone.replace(/\D/g, "");

  if (!digits) return { phone: "", isGuardian: false };
  return {
    phone: digits.startsWith("57") ? digits : `57${digits}`,
    isGuardian: Boolean(item.student.telefonoPadre)
  };
}

function createWhatsappPaymentMessage(card: PaymentCard, isGuardian: boolean) {
  const item = card.primaryItem;
  const status = card.displayStatus;
  const studentName = `${item.student.nombre} ${item.student.apellido}`;
  const firstName = item.student.nombre.split(" ")[0] || studentName;
  const amount = currency(card.totalAmount);

  if (card.isConsolidated) {
    const monthlyItems = card.items.filter((payment) => payment.kind === "MONTHLY_PAYMENT");
    const monthsCopy = card.items.map(paymentConceptCopy).join(", ");
    const debtCountCopy = monthlyItems.length
      ? `${monthlyItems.length} ${monthlyItems.length === 1 ? "mensualidad vencida" : "mensualidades vencidas"}`
      : `${card.items.length} ${card.items.length === 1 ? "cobro vencido" : "cobros vencidos"}`;

    if (isGuardian) {
      return `Hola, te recordamos que ${studentName} tiene ${debtCountCopy}: ${monthsCopy}. El valor total pendiente es ${amount}. Por favor realiza el pago lo antes posible para ponerse al dia.`;
    }

    return `Hola ${firstName}, te recordamos que tienes ${debtCountCopy}: ${monthsCopy}. El valor total pendiente es ${amount}. Por favor realiza el pago lo antes posible para ponerte al dia.`;
  }

  const concept = paymentConceptLabel(item);
  const ownerText = isGuardian ? `la ${concept} de ${studentName}` : `tu ${concept}`;

  if (status === "VENCIDO") {
    return `Hola, te recordamos que ${ownerText} está vencida por valor de ${amount}. ${overdueAgeText(item.fechaVencimiento)}. Por favor realiza el pago lo antes posible.`;
  }

  if (status === "PENDIENTE_HOY") {
    return `Hola, te recordamos que hoy es el día de pago de ${ownerText} por un valor de ${amount}.`;
  }

  return `Hola, te recordamos que ${ownerText} vence el ${formatDate(item.fechaVencimiento)} por un valor de ${amount}.`;
}

function amountClassName(status: PaymentDisplayStatus) {
  return status === "VENCIDO" ? "text-rose-700" : "text-brand-600";
}

function resolvePaymentDisplayStatus(item: DuePayment): PaymentDisplayStatus {
  if (item.estado === "PAGADO") return "PAGADO";

  const dueDate = startOfLocalCalendarDay(new Date(item.fechaVencimiento));
  const today = startOfLocalCalendarDay(new Date());

  if (dueDate.getTime() < today.getTime() || item.estado === "VENCIDO") return "VENCIDO";
  if (dueDate.getTime() === today.getTime()) return "PENDIENTE_HOY";
  return "PROXIMO_A_VENCER";
}

function paymentStatusLabel(status: PaymentDisplayStatus) {
  if (status === "PAGADO") return "Pagado";
  if (status === "VENCIDO") return "Vencido";
  if (status === "PENDIENTE_HOY") return "Pendiente";
  return "Próximo a vencer";
}

function statusBadgeClassName(status: PaymentDisplayStatus) {
  return cn(
    "rounded-full px-2.5 py-1 text-[11px] font-black",
    status === "VENCIDO" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
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
