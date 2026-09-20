import { FiCalendar, FiMail, FiPhone, FiUser } from "react-icons/fi";
import { cn, formatDate } from "@/lib/web-utils";
import type { ClientPlanResponse } from "@/lib/web-types";

/**
 * Resumen de la cuenta para la cabecera de Ajustes. Es solo lectura: los campos
 * editables viven en el formulario de abajo, asi que aqui se muestran compactos
 * y sin competir con el.
 */
export function ClientAccountSummary({ data }: { data: ClientPlanResponse }) {
  const { client, subscription } = data;
  const isOverdue = subscription.daysUntilNextBilling < 0;
  const remainingDays = Math.max(subscription.daysUntilNextBilling, 0);

  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <FiUser className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-ink-900">{client.businessName}</p>
            <p className="mt-0.5 truncate text-sm text-ink-500">{client.nombre}</p>
          </div>
        </div>

        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold",
            isOverdue ? "bg-rose-50 text-rose-700" : "bg-brand-50 text-brand-700"
          )}
        >
          {isOverdue ? "Plan vencido" : `${remainingDays} día${remainingDays === 1 ? "" : "s"} restantes`}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 border-t border-ink-100 pt-5 sm:grid-cols-3">
        <AccountField icon={<FiMail />} label="Correo" value={client.email} />
        <AccountField icon={<FiPhone />} label="Teléfono" value={client.telefono ?? "Sin teléfono"} />
        <AccountField
          icon={<FiCalendar />}
          label="Próximo cobro"
          value={formatDate(subscription.nextBillingAt)}
          tone={isOverdue ? "danger" : "default"}
        />
      </dl>
    </section>
  );
}

function AccountField({
  icon,
  label,
  value,
  tone = "default"
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="min-w-0 rounded-xl bg-ink-50/60 p-3">
      <dt className="mb-1 flex items-center gap-1.5">
        <span className="flex size-3.5 items-center text-ink-400">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</span>
      </dt>
      {/* `truncate` en vez de partir el texto: un correo largo cortado en tres
          lineas desalinea toda la fila. El valor completo queda en el title. */}
      <dd
        className={cn(
          "truncate text-sm font-bold",
          tone === "danger" ? "text-rose-700" : "text-ink-800"
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
