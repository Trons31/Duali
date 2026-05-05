import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { currency, formatDateTime } from "@/lib/web-utils";
import type { AccountingSummary, NotificationItem } from "@/lib/web-types";

type DueItem = {
  id: string;
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  monto: number | string;
  fechaVencimiento: string;
  student: {
    nombre: string;
    apellido: string;
  };
  group?: {
    nombre: string;
  } | null;
};

export function DashboardHome({
  summary,
  pending,
  overdue,
  notifications = []
}: {
  summary: AccountingSummary;
  pending: DueItem[];
  overdue: DueItem[];
  notifications?: NotificationItem[];
}) {
  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ingresos totales" value={currency(summary.ingresosTotales)} hint="Todo lo recibido hasta hoy." />
        <StatCard
          label="Pendientes por cobrar"
          value={currency(summary.pendientesPorCobrar)}
          hint="Cobros del día aún abiertos."
          tone="warning"
        />
        <StatCard
          label="Balance"
          value={currency(summary.balance)}
          hint={`${summary.estudiantesActivos} estudiantes activos.`}
          tone={summary.balance >= 0 ? "success" : "danger"}
        />
        <StatCard
          label="Pagos vencidos"
          value={String(summary.mensualidadesVencidas + summary.inscripcionesVencidas)}
          hint="Recordatorios críticos que exigen seguimiento."
          tone="danger"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="shell-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Hoy</p>
              <h2 className="mt-2 text-xl font-black text-ink-950">Cobros pendientes</h2>
            </div>
            <Link href="/dashboard/cobros/pendientes" className="text-sm font-semibold text-brand-700">
              Ver todos
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {pending.length ? (
              pending.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-3xl border border-ink-100 bg-cream px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-ink-950">
                        {item.student.nombre} {item.student.apellido}
                      </p>
                      <p className="mt-1 text-sm text-ink-500">
                        {item.kind === "MONTHLY_PAYMENT" ? "Mensualidad" : "Inscripción"} • {item.group?.nombre ?? "Sin grupo"}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-brand-700">{currency(item.monto)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-3xl bg-cream px-4 py-6 text-sm text-ink-500">No tienes cobros pendientes para hoy.</p>
            )}
          </div>
        </article>

        <article className="shell-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-600">Urgente</p>
              <h2 className="mt-2 text-xl font-black text-ink-950">Vencidos</h2>
            </div>
            <Link href="/dashboard/cobros/vencidos" className="text-sm font-semibold text-rose-600">
              Resolver
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {overdue.length ? (
              overdue.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-3xl border border-rose-100 bg-rose-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-ink-950">
                        {item.student.nombre} {item.student.apellido}
                      </p>
                      <p className="mt-1 text-sm text-ink-500">
                        Vence {new Date(item.fechaVencimiento).toLocaleDateString("es-CO")}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-rose-700">{currency(item.monto)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-3xl bg-cream px-4 py-6 text-sm text-ink-500">No tienes cobros vencidos pendientes.</p>
            )}
          </div>
        </article>
      </section>

      <section className="shell-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Actividad</p>
            <h2 className="mt-2 text-xl font-black text-ink-950">Notificaciones recientes</h2>
          </div>
          <Link href="/dashboard/notificaciones" className="text-sm font-semibold text-brand-700">
            Abrir bandeja
          </Link>
        </div>
        <div className="mt-5 overflow-hidden rounded-3xl border border-ink-100">
          {notifications.length ? (
            notifications.slice(0, 6).map((notification, index) => (
              <div key={notification.id} className={index === 0 ? "px-4 py-4" : "soft-divider px-4 py-4"}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-950">{notification.title}</p>
                    <p className="mt-1 text-sm text-ink-500">{notification.body}</p>
                  </div>
                  <StatusBadge value={notification.status} />
                </div>
                <p className="mt-3 text-xs text-ink-400">{formatDateTime(notification.createdAt)}</p>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-ink-500">Aún no hay notificaciones registradas.</div>
          )}
        </div>
      </section>
    </div>
  );
}
