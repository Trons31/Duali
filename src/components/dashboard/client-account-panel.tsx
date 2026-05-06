import { FiCalendar, FiMail, FiPhone, FiUser } from "react-icons/fi";
import { formatDate } from "@/lib/web-utils";
import type { ClientPlanResponse } from "@/lib/web-types";

export function ClientAccountPanel({ data }: { data: ClientPlanResponse }) {
  const { client, subscription } = data;
  const isOverdue = subscription.daysUntilNextBilling < 0;
  const remainingDays = Math.max(subscription.daysUntilNextBilling, 0);

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-white px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-brand-700">Cliente</p>
          <h1 className="mt-2 text-[2rem] font-black leading-none tracking-tight text-ink-950">Mi cuenta</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-500">
            Revisa los datos principales de tu negocio y el estado del próximo cobro de tu suscripción.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <InfoCard icon={<FiUser />} label="Responsable" value={client.nombre} helper={client.businessName} />
          <InfoCard icon={<FiMail />} label="Correo" value={client.email} helper="Acceso a la plataforma" />
          <InfoCard icon={<FiPhone />} label="Teléfono" value={client.telefono ?? "Sin teléfono"} helper="Contacto del negocio" />
          <InfoCard
            icon={<FiCalendar />}
            label="Días restantes"
            value={isOverdue ? "0 días" : formatDays(remainingDays)}
            helper={isOverdue ? "Pago vencido" : "de 30 días del plan"}
          />
          <InfoCard
            icon={<FiCalendar />}
            label="Próximo cobro"
            value={formatDate(subscription.nextBillingAt)}
            helper={isOverdue ? `${Math.abs(subscription.daysUntilNextBilling)} días vencido` : "Fecha de renovación"}
          />
        </section>
      </div>
    </div>
  );
}

function formatDays(days: number) {
  return `${days} día${days === 1 ? "" : "s"}`;
}

function InfoCard({
  icon,
  label,
  value,
  helper
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-[24px] border border-ink-100 bg-white px-4 py-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">{label}</p>
          <p className="mt-2 break-words text-sm font-black text-ink-950">{value}</p>
          <p className="mt-1 text-xs text-ink-500">{helper}</p>
        </div>
      </div>
    </article>
  );
}
