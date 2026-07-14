import { FiCalendar, FiCheckCircle, FiClock, FiCreditCard } from "react-icons/fi";
import { cn, currency, formatDate } from "@/lib/web-utils";
import type { ClientPlanResponse } from "@/lib/web-types";

export function ClientPlanPanel({ data }: { data: ClientPlanResponse }) {
  const { subscription } = data;
  const isOverdue = subscription.daysUntilNextBilling < 0;
  const remainingDays = Math.max(subscription.daysUntilNextBilling, 0);

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
            <p className="mt-2 hidden text-sm leading-5 text-ink-500 sm:block">Consulta el estado y los beneficios de tu suscripción.</p>
          </div>
        </header>

        <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-500">Plan actual</p>
              <h2 className="mt-1 text-lg font-black text-ink-950">{subscription.plan.name}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-5 text-ink-500">{subscription.plan.description}</p>
            </div>
            <span className={isOverdue ? "rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700" : "rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700"}>
              {subscription.status}
            </span>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
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

        <section className="rounded-[24px] border border-ink-100 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-black text-ink-950">Lo que incluye</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {subscription.plan.features.map((feature, index) => (
              <div key={`${String(feature)}-${index}`} className="flex items-start gap-3 rounded-2xl border border-ink-100 p-3">
                <FiCheckCircle className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <p className="text-sm font-medium leading-5 text-ink-700">{String(feature)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-ink-100 bg-white shadow-sm">
          <div className="flex items-end justify-between gap-3 px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-black text-ink-950">Pagos del plan</h2>
              <p className="mt-1 text-xs text-ink-500">{subscription.payments.length} pagos registrados</p>
            </div>
          </div>
          <div className="border-t border-ink-100 p-4 sm:p-6">
            {subscription.payments.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {subscription.payments.map((payment) => (
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
    green: { icon: "bg-emerald-50 text-emerald-600", value: "text-emerald-700" },
    blue: { icon: "bg-blue-50 text-blue-600", value: "text-blue-600" },
    purple: { icon: "bg-violet-50 text-violet-600", value: "text-violet-600" },
    amber: { icon: "bg-amber-50 text-amber-500", value: "text-amber-500" }
  }[tone];

  return (
    <article className="flex h-[152px] min-w-0 flex-col rounded-2xl border border-ink-100 bg-white p-3 shadow-sm transition hover:shadow-md sm:h-auto sm:rounded-[24px] sm:p-6">
      <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-start gap-2 sm:flex sm:gap-4">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-12 sm:rounded-2xl", styles.icon)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="min-h-8 text-[11px] font-bold leading-4 text-ink-500 sm:min-h-0 sm:text-sm">{label}</p>
          <p className={cn("mt-1.5 break-words text-base font-black leading-tight sm:mt-3 sm:text-xl", styles.value)}>{value}</p>
        </div>
      </div>
      <p className="mt-auto min-w-0 pt-3 text-[11px] font-medium leading-4 text-ink-500 sm:pt-8 sm:text-sm">{helper}</p>
    </article>
  );
}
