"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { FiCheck, FiChevronDown, FiChevronUp, FiMessageCircle, FiSearch } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency, formatDate } from "@/lib/web-utils";

type DuePayment = {
  id: string;
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  monto: number | string;
  fechaVencimiento: string;
  mes?: number | null;
  anio?: number | null;
  student: {
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

export function DuePaymentsPanel({
  items,
  titleAction
}: {
  items: DuePayment[];
  titleAction: "pendiente" | "vencido";
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [payTarget, setPayTarget] = useState<DuePayment | null>(null);
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

  async function payCurrent() {
    if (!payTarget) return;
    const endpoint =
      payTarget.kind === "MONTHLY_PAYMENT"
        ? `/api/monthly-payments/${payTarget.id}/pay`
        : `/api/enrollment-payments/${payTarget.id}/pay`;

    await clientApiFetch(endpoint, token, {
      method: "PUT",
      body: JSON.stringify({})
    })
      .then(() => {
        sileo.success({ title: "Cobro registrado como pagado" });
        setPayTarget(null);
        router.refresh();
      })
      .catch((error: Error) => sileo.error({ title: error.message }));
  }

  async function notifyByWhatsapp(item: DuePayment) {
    const phone = resolveWhatsappPhone(item);
    if (!phone) {
      sileo.error({
        title: "Sin WhatsApp disponible",
        description: "Este alumno no tiene numero registrado para enviar recordatorio."
      });
      return;
    }

    const message = createWhatsappPaymentMessage(item, titleAction);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

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
                {filteredItems.length} {filteredItems.length === 1 ? "registro" : "registros"}
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
            filteredItems.length ? (
              <div className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6">
                {filteredItems.map((item) => (
                  <article
                    key={`${item.kind}-${item.id}`}
                    className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
                  >
                    <div className="space-y-5">
                      <div>
                        <p className="text-[15px] font-semibold text-ink-950">
                          {item.student.nombre} {item.student.apellido}
                        </p>
                        <p className="mt-1 text-sm text-ink-500">{paymentDateCopy(item)}</p>
                        {titleAction === "vencido" ? (
                          <p className="mt-2 text-sm font-semibold text-rose-600">
                            Lleva {overdueDays(item.fechaVencimiento)} dia{overdueDays(item.fechaVencimiento) === 1 ? "" : "s"} vencido
                          </p>
                        ) : null}
                        <p className={cn("mt-4 text-[1.9rem] font-black tracking-tight", amountClassName(titleAction))}>
                          {currency(item.monto)}
                        </p>
                      </div>

                      <div className="grid gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-14 rounded-[22px] border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                          onClick={() => notifyByWhatsapp(item)}
                        >
                          <FiMessageCircle className="size-5" />
                          Notificar por WhatsApp
                        </Button>
                        <Button type="button" className="min-h-14 rounded-[22px]" onClick={() => setPayTarget(item)}>
                          <FiCheck className="size-5" />
                          Marcar pagado
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
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

      <ConfirmDialog
        open={Boolean(payTarget)}
        title={`Marcar cobro ${titleAction === "pendiente" ? "pendiente" : "vencido"} como pagado`}
        description={`Confirmaras el pago de ${payTarget?.student.nombre} ${payTarget?.student.apellido}.`}
        notice={`Marca este cobro como pagado solo si el estudiante ya pago la ${paymentConceptLabel(payTarget ?? { kind: "MONTHLY_PAYMENT" } as DuePayment)} pendiente.`}
        variant="primary"
        noticeTone="success"
        confirmText="Confirmar pago"
        onClose={() => setPayTarget(null)}
        onConfirm={payCurrent}
      />
    </div>
  );
}

function paymentConceptLabel(item: DuePayment) {
  return item.kind === "MONTHLY_PAYMENT" ? "mensualidad" : "inscripcion";
}

function paymentDateCopy(item: DuePayment) {
  if (item.kind === "MONTHLY_PAYMENT" && item.mes && item.anio) {
    const monthName = MONTH_NAMES[item.mes - 1] ?? String(item.mes);
    return `${monthName}/${item.anio} - vence ${formatDate(item.fechaVencimiento)}`;
  }

  return `inscripcion - vence ${formatDate(item.fechaVencimiento)}`;
}

function resolveWhatsappPhone(item: DuePayment) {
  const rawPhone = item.student.esMenorDeEdad
    ? item.student.telefonoPadre || item.student.celular || ""
    : item.student.celular || item.student.telefonoPadre || "";
  const digits = rawPhone.replace(/\D/g, "");

  if (!digits) return "";
  return digits.startsWith("57") ? digits : `57${digits}`;
}

function createWhatsappPaymentMessage(item: DuePayment, kind: "pendiente" | "vencido") {
  const concept = paymentConceptLabel(item);
  const studentName = `${item.student.nombre} ${item.student.apellido}`;
  const amount = currency(item.monto);
  const ownerText = item.student.esMenorDeEdad ? `la ${concept} de ${studentName}` : `tu ${concept}`;

  if (kind === "vencido") {
    const days = overdueDays(item.fechaVencimiento);
    return `Hola, te recordamos que ${ownerText} esta vencida por valor de ${amount}. Lleva ${days} dia${days === 1 ? "" : "s"} de retraso. Por favor realiza el pago lo antes posible.`;
  }

  return `Hola, te recordamos que hoy es el dia de pago de ${ownerText} por un valor de ${amount}.`;
}

function amountClassName(kind: "pendiente" | "vencido") {
  return kind === "vencido" ? "text-rose-700" : "text-brand-600";
}

function overdueDays(date: string) {
  const dueDate = new Date(date);
  const now = new Date();
  const dueUtc = Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((nowUtc - dueUtc) / 86400000));
}
