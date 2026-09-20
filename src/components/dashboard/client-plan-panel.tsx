"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FiAlertTriangle,
  FiBell,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiMessageCircle,
  FiRepeat,
  FiShield
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { clientApiFetch } from "@/lib/client-api";
import { cn, currency, formatDate } from "@/lib/web-utils";
import type { ClientPlanResponse } from "@/lib/web-types";

type PlanTab = "plan" | "modules" | "payments";

const TABS: Array<{ key: PlanTab; label: string }> = [
  { key: "plan", label: "Mi plan" },
  { key: "modules", label: "Módulos" },
  { key: "payments", label: "Pagos" }
];

/** Precio de la automatizacion por WhatsApp. Aun no existe modelo en base de datos. */
const WHATSAPP_MODULE_PRICE = 20000;

const WHATSAPP_FEATURES = [
  { icon: FiCheck, title: "Confirmación de cobro", copy: "Al registrar el pago o validar el abono." },
  { icon: FiBell, title: "Recordatorio antes del vencimiento", copy: "Tú eliges cuántos días antes se envía." },
  { icon: FiRepeat, title: "Recuperación de cartera", copy: "Un mensaje de seguimiento a los días que elijas." },
  { icon: FiShield, title: "Permisos y trazabilidad", copy: "Cada envío queda registrado con su estado." }
];

export function ClientPlanPanel({ data }: { data: ClientPlanResponse }) {
  const { subscription } = data;
  const [activeTab, setActiveTab] = React.useState<PlanTab>("plan");

  const isOverdue = subscription.daysUntilNextBilling < 0;
  const remainingDays = Math.max(subscription.daysUntilNextBilling, 0);
  const isUrgent = remainingDays <= 3;

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex min-w-0 items-start gap-3 px-1">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <FiCreditCard className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-700">Cuenta</p>
            <h1 className="mt-1 text-[1.75rem] font-black leading-none text-ink-950 sm:text-[2rem]">Mi plan</h1>
            <p className="mt-2 text-sm leading-5 text-ink-500">Gestiona tu suscripción y tus pagos</p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-ink-100 bg-white p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={activeTab === tab.key ? "page" : undefined}
              className={cn(
                "rounded-xl px-3 py-3 text-sm font-black transition-all sm:px-4",
                activeTab === tab.key
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-ink-500 hover:bg-ink-50 hover:text-ink-950"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isUrgent ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <FiAlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-500" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-rose-700">
                {isOverdue
                  ? "Tu plan está vencido"
                  : remainingDays === 0
                    ? "Tu plan vence hoy"
                    : `Tu plan vence en ${remainingDays} día${remainingDays === 1 ? "" : "s"}`}
              </p>
              <p className="mt-0.5 text-xs text-rose-600">
                Renueva tu plan para no perder el acceso a tus datos.
              </p>
            </div>
          </div>
        ) : null}

        {activeTab === "plan" ? (
          <PlanTabContent subscription={subscription} isOverdue={isOverdue} remainingDays={remainingDays} />
        ) : null}

        {activeTab === "modules" ? <ModulesTabContent basePrice={subscription.price} /> : null}

        {activeTab === "payments" ? <PaymentsTabContent payments={subscription.payments} /> : null}
      </div>
    </div>
  );
}

function PlanTabContent({
  subscription,
  isOverdue,
  remainingDays
}: {
  subscription: ClientPlanResponse["subscription"];
  isOverdue: boolean;
  remainingDays: number;
}) {
  return (
    <>
      <section className="rounded-[24px] border border-brand-200 bg-brand-50/60 p-4 shadow-sm sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-700">
                Plan actual
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-bold",
                  isOverdue ? "bg-rose-100 text-rose-700" : "bg-brand-100 text-brand-800"
                )}
              >
                {subscription.status}
              </span>
            </div>

            <h2 className="mt-2 text-2xl font-black text-ink-950">{subscription.plan.name}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-500">{subscription.plan.description}</p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-xl font-black leading-none text-ink-950 sm:text-2xl">
              {currency(subscription.price)}
            </p>
            <p className="mt-1 text-xs text-ink-400">por mes</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-ink-600">Progreso del período</p>
            <p className={cn("text-xs font-black", isOverdue ? "text-rose-600" : "text-brand-700")}>
              {isOverdue
                ? "Vencido"
                : remainingDays === 0
                  ? "Vence hoy"
                  : `${remainingDays} día${remainingDays === 1 ? "" : "s"}`}
            </p>
          </div>
          <PeriodProgressBar
            startedAt={subscription.startedAt}
            endsAt={subscription.nextBillingAt}
            isOverdue={isOverdue}
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-ink-400">
            <span>Inicio</span>
            <span>Fin del período</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <PlanDateCard label="Inicio" value={formatDate(subscription.startedAt)} icon={<FiCalendar />} />
          <PlanDateCard
            label={isOverdue ? "Venció el" : "Próximo cobro"}
            value={formatDate(subscription.nextBillingAt)}
            icon={<FiClock />}
            tone={isOverdue ? "danger" : "brand"}
          />
        </div>

        {subscription.plan.features.length ? (
          <div className="mt-5 border-t border-white/70 pt-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500">
              Incluido en tu plan
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {subscription.plan.features.map((feature, index) => (
                <div
                  key={`${String(feature)}-${index}`}
                  className="flex items-center gap-2 text-xs text-ink-700"
                >
                  <FiCheck className="size-3.5 shrink-0 text-brand-600" />
                  {String(feature)}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <CancelSubscriptionSection />
    </>
  );
}

function PeriodProgressBar({
  startedAt,
  endsAt,
  isOverdue
}: {
  startedAt: string;
  endsAt: string;
  isOverdue: boolean;
}) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endsAt).getTime();
  const total = end - start;
  // Sin un periodo valido no hay progreso que calcular: se deja la barra llena
  // en lugar de dividir por cero o dibujar un porcentaje inventado.
  const elapsed = total > 0 ? Math.min(Math.max(Date.now() - start, 0), total) / total : 1;
  const percent = Math.round((isOverdue ? 1 : elapsed) * 100);

  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100">
      <div
        className={cn("h-full rounded-full transition-all", isOverdue ? "bg-rose-500" : "bg-brand-500")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function PlanDateCard({
  label,
  value,
  icon,
  tone = "brand"
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "brand" | "danger";
}) {
  return (
    <div className="rounded-xl bg-white/70 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span className={cn("flex size-3.5 items-center", tone === "danger" ? "text-rose-500" : "text-brand-600")}>
          {icon}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</span>
      </div>
      <p className={cn("text-sm font-bold", tone === "danger" ? "text-rose-700" : "text-ink-800")}>
        {value}
      </p>
    </div>
  );
}

function ModulesTabContent({ basePrice }: { basePrice: number }) {
  const total = basePrice + WHATSAPP_MODULE_PRICE;

  return (
    <>
      <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <FiMessageCircle className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black leading-tight text-ink-950">Automatización por WhatsApp</h2>
            <p className="mt-1.5 text-sm leading-5 text-ink-500">
              Confirma cobros, avisa pagos validados, recuerda la mensualidad antes de vencer y recupera
              cartera después de varios días.
            </p>
          </div>
        </div>

        <span className="mt-4 inline-flex rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-700">
          Disponible
        </span>

        <p className="mt-3 text-sm leading-5 text-ink-500">
          Solicita la activación cuando quieras; al aprobarse se incorporará al próximo cobro.
        </p>

        <div className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
          {WHATSAPP_FEATURES.map((feature) => (
            <div key={feature.title} className="flex items-start gap-3 py-3">
              <feature.icon className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink-950">{feature.title}</p>
                <p className="mt-0.5 text-xs leading-4 text-ink-500">{feature.copy}</p>
              </div>
            </div>
          ))}
        </div>

        <RequestModuleButton />
      </section>

      <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Valor del módulo</p>
        <p className="mt-1.5 text-2xl font-black text-ink-950">{currency(WHATSAPP_MODULE_PRICE)}</p>
        <p className="mt-1 text-xs font-semibold text-ink-500">por mes, sin descuento</p>

        <dl className="mt-5 space-y-2.5 border-t border-ink-100 pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-500">Plan base</dt>
            <dd className="font-bold text-ink-950">{currency(basePrice)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-500">WhatsApp</dt>
            <dd className="font-bold text-ink-950">{currency(WHATSAPP_MODULE_PRICE)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
            <dt className="font-black text-ink-950">Total si lo activas</dt>
            <dd className="font-black text-brand-700">{currency(total)}</dd>
          </div>
        </dl>

        <div className="mt-4 rounded-2xl bg-ink-50 p-4">
          <p className="text-xs font-bold text-ink-600">Proyección mensual</p>
          <p className="mt-1 text-xl font-black text-ink-950">{currency(total)}</p>
          <p className="mt-1.5 text-[11px] leading-4 text-ink-500">
            El módulo se cobra completo cada mes junto con tu plan base.
          </p>
        </div>
      </section>
    </>
  );
}

function RequestModuleButton() {
  const [requested, setRequested] = React.useState(false);

  if (requested) {
    return (
      <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center">
        <FiCheckCircle className="mx-auto size-5 text-brand-600" />
        <p className="mt-2 text-sm font-bold text-brand-800">Solicitud enviada</p>
        <p className="mt-1 text-xs leading-4 text-brand-700">
          Nos pondremos en contacto contigo para activar el módulo.
        </p>
      </div>
    );
  }

  return (
    <Button className="mt-5 w-full" onClick={() => setRequested(true)}>
      Solicitar activación
    </Button>
  );
}

function PaymentsTabContent({ payments }: { payments: ClientPlanResponse["subscription"]["payments"] }) {
  return (
    <section className="rounded-[24px] border border-ink-100 bg-white shadow-sm">
      <div className="flex items-end justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-black text-ink-950">Pagos del plan</h2>
          <p className="mt-1 text-xs text-ink-500">
            {payments.length} pago{payments.length === 1 ? "" : "s"} registrado
            {payments.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="border-t border-ink-100 p-4 sm:p-6">
        {payments.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {payments.map((payment) => (
              <article
                key={payment.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-ink-100 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-950">{formatDate(payment.paidAt)}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDate(payment.periodStart)} - {formatDate(payment.periodEnd)}
                  </p>
                  <p className="mt-1 text-xs text-ink-400">{payment.paymentMethod ?? "Sin método"}</p>
                </div>
                <p className="shrink-0 text-sm font-black text-brand-600">{currency(payment.amount)}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-5 py-8 text-center text-sm text-ink-500">
            Aún no hay pagos registrados para este plan.
          </div>
        )}
      </div>
    </section>
  );
}

function CancelSubscriptionSection() {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  const canConfirm = confirmation.trim().toUpperCase() === "CANCELAR";

  async function handleCancel() {
    if (!canConfirm || cancelling) return;

    const token = session?.user.apiToken;
    if (!token) {
      setError("Tu sesión expiró. Vuelve a iniciar sesión e inténtalo de nuevo.");
      return;
    }

    setCancelling(true);
    setError(null);

    try {
      await clientApiFetch("/api/client/plan/cancel", token, {
        method: "POST",
        body: JSON.stringify({ confirmation: confirmation.trim().toUpperCase() })
      });

      router.replace("/suscripcion-cancelada");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "No se pudo cancelar la suscripción");
      setCancelling(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-rose-200 bg-rose-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-black text-rose-900">Cancelar suscripción</h2>
          <p className="mt-1 text-sm leading-6 text-rose-800">
            El acceso se bloqueará inmediatamente para ti y para todos los usuarios asociados. Tus datos
            se conservarán, pero nadie podrá iniciar sesión ni usar el sistema.
          </p>
        </div>
        <FiAlertTriangle className="mt-1 size-5 shrink-0 text-rose-600" />
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-black text-rose-700 transition hover:bg-rose-100"
        >
          Cancelar mi suscripción
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-rose-200 bg-white p-4">
          <p className="text-sm font-bold text-ink-800">
            Esta acción es inmediata y no se puede deshacer desde tu cuenta.
          </p>

          <label
            htmlFor="cancel-confirmation"
            className="mt-3 block text-xs font-black uppercase tracking-wide text-ink-500"
          >
            Escribe CANCELAR para confirmar
          </label>
          <input
            id="cancel-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
            placeholder="CANCELAR"
          />

          {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmation("");
                setError(null);
              }}
              disabled={cancelling}
              className="flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm font-black text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling || !canConfirm}
              className="flex-1 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-200"
            >
              {cancelling ? "Bloqueando acceso..." : "Confirmar cancelación"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
