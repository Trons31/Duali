import { FiCalendar, FiCheckCircle, FiClock, FiCreditCard } from "react-icons/fi";
import { currency, formatDate } from "@/lib/web-utils";
import type { ClientPlanResponse } from "@/lib/web-types";

export function ClientPlanPanel({ data }: { data: ClientPlanResponse }) {
  const { subscription } = data;
  const isOverdue = subscription.daysUntilNextBilling < 0;
  const remainingDays = Math.max(subscription.daysUntilNextBilling, 0);

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-white px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-brand-700">Mi plan</p>
              <h1 className="mt-2 text-[2rem] font-black leading-none tracking-tight text-ink-950">
                {subscription.plan.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-500">{subscription.plan.description}</p>
            </div>
            <span className={isOverdue ? "rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700" : "rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700"}>
              {subscription.status}
            </span>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PlanStat label="Precio" value={currency(subscription.price)} helper="mensual" icon={<FiCreditCard />} tone="green" />
          <PlanStat
            label="Días restantes"
            value={isOverdue ? "0 días" : formatDays(remainingDays)}
            helper={isOverdue ? `${Math.abs(subscription.daysUntilNextBilling)} días vencido` : "de 30 días del plan"}
            icon={<FiCalendar />}
            tone="blue"
          />
          <PlanStat label="Finaliza" value={formatDate(subscription.endsAt)} helper="período actual" icon={<FiCheckCircle />} tone="purple" />
          <PlanStat
            label="Próximo cobro"
            value={formatDate(subscription.nextBillingAt)}
            helper={isOverdue ? "Pago vencido" : "fecha de renovación"}
            icon={<FiClock />}
            tone="amber"
          />
        </section>

        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft">
          <h2 className="text-base font-black text-ink-950">Lo que incluye</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {subscription.plan.features.map((feature, index) => (
              <div key={`${String(feature)}-${index}`} className="flex items-start gap-3 rounded-2xl border border-ink-100 px-3 py-3">
                <FiCheckCircle className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <p className="text-sm font-semibold text-ink-700">{String(feature)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-ink-100 bg-white shadow-soft">
          <div className="flex items-end justify-between gap-3 px-5 py-5">
            <div>
              <h2 className="text-base font-black text-ink-950">Pagos del plan</h2>
              <p className="mt-1 text-xs text-ink-500">{subscription.payments.length} pagos registrados</p>
            </div>
          </div>
          <div className="border-t border-ink-100">
            {subscription.payments.length ? (
              subscription.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-4 border-b border-ink-100 px-5 py-4 last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-950">{formatDate(payment.paidAt)}</p>
                    <p className="mt-1 text-xs text-ink-500">
                      {formatDate(payment.periodStart)} - {formatDate(payment.periodEnd)}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">{payment.paymentMethod ?? "Sin método"}</p>
                  </div>
                  <p className="shrink-0 text-sm font-black text-brand-600">{currency(payment.amount)}</p>
                </div>
              ))
            ) : (
              <div className="px-5 py-8 text-sm text-ink-500">Aún no hay pagos registrados para este plan.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatDays(days: number) {
  return `${days} día${days === 1 ? "" : "s"}`;
}

function PlanStat({
  label,
  value,
  helper,
  icon,
  tone
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone: "green" | "blue" | "purple" | "amber";
}) {
  const styles = {
    green: "bg-emerald-50 text-brand-600",
    blue: "bg-sky-50 text-sky-600",
    purple: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600"
  }[tone];

  return (
    <article className={`rounded-[22px] border border-ink-100 px-4 py-4 shadow-soft ${styles}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold text-ink-500">{label}</p>
        <div className="text-current">{icon}</div>
      </div>
      <p className="mt-4 text-[1rem] font-black leading-tight text-current">{value}</p>
      <p className="mt-2 text-[11px] font-semibold text-ink-500">{helper}</p>
    </article>
  );
}
