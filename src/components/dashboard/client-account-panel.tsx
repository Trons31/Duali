import { FiCalendar, FiMail, FiPhone, FiSettings, FiUser } from "react-icons/fi";
import { cn, formatDate } from "@/lib/web-utils";
import type { ClientPlanResponse } from "@/lib/web-types";

export function ClientAccountPanel({ data }: { data: ClientPlanResponse }) {
  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-[#f8fafc] px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex min-w-0 items-start gap-3 px-1">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <FiSettings className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-700">Ajustes</p>
            <h1 className="mt-1 text-[1.75rem] font-black leading-none text-ink-950 sm:text-[2rem]">Mi cuenta</h1>
            <p className="mt-2 hidden text-sm leading-5 text-ink-500 sm:block">Consulta los datos y el estado de tu suscripción.</p>
          </div>
        </header>

        <ClientAccountSummary data={data} />
      </div>
    </div>
  );
}

export function ClientAccountSummary({ data }: { data: ClientPlanResponse }) {
  const { client, subscription } = data;
  const isOverdue = subscription.daysUntilNextBilling < 0;
  const remainingDays = Math.max(subscription.daysUntilNextBilling, 0);

  return (
    <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      <InfoCard icon={<FiUser />} label="Responsable" value={client.nombre} helper={client.businessName} tone="green" />
      <InfoCard icon={<FiMail />} label="Correo" value={client.email} helper="Acceso a la plataforma" tone="blue" />
      <InfoCard icon={<FiPhone />} label="Teléfono" value={client.telefono ?? "Sin teléfono"} helper="Contacto del negocio" tone="violet" />
      <InfoCard
        icon={<FiCalendar />}
        label="Días restantes"
        value={isOverdue ? "0 días" : formatDays(remainingDays)}
        helper={isOverdue ? "Pago vencido" : "de 30 días del plan"}
        tone="amber"
      />
      <InfoCard
        icon={<FiCalendar />}
        label="Próximo cobro"
        value={formatDate(subscription.nextBillingAt)}
        helper={isOverdue ? `${Math.abs(subscription.daysUntilNextBilling)} días vencido` : "Fecha de renovación"}
        tone="green"
        className="col-span-2 lg:col-span-1"
      />
    </section>
  );
}

function formatDays(days: number) {
  return `${days} día${days === 1 ? "" : "s"}`;
}

function InfoCard({
  icon,
  label,
  value,
  helper,
  tone,
  className
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  tone: "green" | "blue" | "violet" | "amber";
  className?: string;
}) {
  const iconStyle = {
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-500"
  }[tone];

  return (
    <article className={cn("flex min-h-32 min-w-0 flex-col rounded-2xl border border-ink-100 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-5", className)}>
      <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-start gap-2 sm:flex sm:gap-3">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10", iconStyle)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="min-h-8 text-[11px] font-bold leading-4 text-ink-500 sm:min-h-0 sm:text-xs">{label}</p>
          <p className="mt-1 break-all text-sm font-black leading-5 text-ink-950 sm:break-words">{value}</p>
        </div>
      </div>
      <p className="mt-auto pt-3 text-[11px] font-medium leading-4 text-ink-500 sm:text-xs">{helper}</p>
    </article>
  );
}
