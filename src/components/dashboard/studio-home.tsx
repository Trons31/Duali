import Link from "next/link";
import {
  FiAlertCircle,
  FiArrowRight,
  FiCalendar,
  FiCheckCircle,
  FiCheckSquare,
  FiChevronRight,
  FiCircle,
  FiCreditCard,
  FiDollarSign,
  FiFileText,
  FiGlobe,
  FiMessageCircle,
  FiPieChart,
  FiShoppingBag,
  FiUsers
} from "react-icons/fi";
import type { StudioDashboardData } from "@/lib/studio-dashboard";
import { WEEKDAYS, dateKeyToDate, formatTimeKey, isoWeekday } from "@/lib/studio-time";
import { cn, currency } from "@/lib/web-utils";

// Inicio del panel para el estudio (spec 013). Componente de servidor.

function longDate(key: string) {
  const text = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "UTC" }).format(dateKeyToDate(key));
  return `${WEEKDAYS[isoWeekday(key) - 1].label} ${text}`;
}

function Stat({ icon, label, value, helper, tone = "default" }: { icon: React.ReactNode; label: string; value: string; helper: string; tone?: "default" | "danger" }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-500 [&>svg]:size-3.5 [&>svg]:text-brand-500">
        {icon}
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-bold sm:text-3xl", tone === "danger" ? "text-rose-600" : "text-ink-900")}>{value}</p>
      <p className="mt-0.5 text-xs text-ink-400">{helper}</p>
    </div>
  );
}

export function StudioHome({ data, userName, baseUrl }: { data: StudioDashboardData; userName?: string | null; baseUrl: string }) {
  const firstName = userName?.trim().split(" ")[0];
  const pageUrl = data.studio.slug && data.studio.paginaPublicaActiva ? `${baseUrl}/s/${data.studio.slug}` : null;
  const share = pageUrl
    ? `https://wa.me/?text=${encodeURIComponent(`Mira el horario y aparta tu cupo en ${data.studio.businessName}: ${pageUrl}`)}`
    : null;
  const steps = [
    { done: data.pasos.disciplinas, label: "Crea tus disciplinas", href: "/dashboard/paquetes" },
    { done: data.pasos.paquetes, label: "Pon precio a tus paquetes", href: "/dashboard/paquetes" },
    { done: data.pasos.horario, label: "Arma tu horario de clases", href: "/dashboard/horario" },
    { done: data.pasos.pagina, label: "Publica tu página para recibir reservas", href: "/dashboard/mi-pagina" }
  ];
  const pending = steps.filter((step) => !step.done).length;
  const tasks: Array<{ count: number; label: string; icon: React.ReactNode; href?: string }> = [
    {
      count: data.atender.asistenciaPendiente,
      label: data.atender.asistenciaPendiente === 1 ? "clase sin asistencia marcada" : "clases sin asistencia marcada",
      icon: <FiCheckSquare />,
      href: "/dashboard/horario?vista=asistencia"
    },
    { count: data.atender.comprobantes, label: "comprobantes de pago por revisar", icon: <FiFileText />, href: "/dashboard/avisos" },
    { count: data.atender.recordatoriosManana, label: "recordatorios para mañana", icon: <FiCalendar /> },
    { count: data.atender.saldosVencidos, label: data.atender.saldosVencidos === 1 ? "saldo vencido" : "saldos vencidos", icon: <FiCreditCard />, href: "/dashboard/avisos" },
    {
      count: data.atender.vencidosSemana,
      label: data.atender.vencidosSemana === 1 ? "plan vencido esta semana sin renovar" : "planes vencidos esta semana sin renovar",
      icon: <FiAlertCircle />,
      href: "/dashboard/avisos"
    },
    { count: data.atender.porVencer, label: "paquetes por vencer o con pocas clases", icon: <FiAlertCircle /> },
    { count: data.atender.conSaldo, label: "clientes con saldo pendiente", icon: <FiCreditCard /> }
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-sm font-medium text-ink-500">
            {data.studio.businessName} · {longDate(data.today)}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900 sm:text-3xl">{firstName ? `Hola, ${firstName}` : "Hola"}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data.clasesHoy
              ? `Hoy tienes ${data.clasesHoy} clase${data.clasesHoy === 1 ? "" : "s"} y ${data.reservasHoy} reserva${data.reservasHoy === 1 ? "" : "s"}.`
              : "Hoy no tienes clases."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Link href="/dashboard/clientes" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            <FiShoppingBag className="size-4" />
            Vender paquete
          </Link>
          <Link href="/dashboard/horario" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            <FiCalendar className="size-4" />
            Ver horario
          </Link>
          {share ? (
            <a
              href={share}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              <FiGlobe className="size-4" />
              Compartir mi página
            </a>
          ) : null}
        </div>
      </section>

      {pending ? (
        <section className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-ink-800">Empieza a recibir reservas</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Te faltan {pending} paso{pending === 1 ? "" : "s"}.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {steps.map((step) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-sm transition hover:shadow-sm",
                    step.done ? "text-ink-400 line-through" : "font-medium text-ink-800"
                  )}
                >
                  {step.done ? <FiCheckCircle className="size-4 shrink-0 text-brand-600" /> : <FiCircle className="size-4 shrink-0 text-ink-300" />}
                  {step.label}
                  {!step.done ? <FiArrowRight className="ml-auto size-4 text-ink-400" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<FiCalendar />} label="Hoy" value={`${data.clasesHoy} clase${data.clasesHoy === 1 ? "" : "s"}`} helper={`${data.reservasHoy} reservas`} />
        <Stat
          icon={<FiPieChart />}
          label="Ocupación semana"
          value={data.ocupacionSemana === null ? "—" : `${data.ocupacionSemana}%`}
          helper="reservas sobre cupos"
        />
        <Stat icon={<FiDollarSign />} label="Ingresos del mes" value={currency(data.ingresosMes)} helper="por paquetes" />
        <Stat icon={<FiCreditCard />} label="Por cobrar" value={currency(data.porCobrar)} helper={`${data.vigentes} paquetes vigentes`} tone={data.porCobrar > 0 ? "danger" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-ink-800">Clases de hoy</h2>
            {data.clasesDeHoy.some((session) => !session.cancelada) ? (
              // Spec 019 D5: el acceso mas rapido para tomar asistencia.
              <Link
                href="/dashboard/horario?vista=asistencia"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <FiCheckSquare className="size-3.5" />
                Tomar asistencia
              </Link>
            ) : (
              <Link href="/dashboard/horario" className="text-xs font-medium text-brand-600 hover:underline">
                Ver horario
              </Link>
            )}
          </div>
          {data.clasesDeHoy.length ? (
            <ul className="mt-3 space-y-2">
              {data.clasesDeHoy.map((session) => {
                const percentage = session.cupo ? Math.min((session.reservadas / session.cupo) * 100, 100) : 0;
                return (
                  <li key={session.key}>
                    <Link
                      href="/dashboard/horario"
                      className={cn(
                        "flex items-center gap-3 rounded-xl border border-ink-100 border-l-4 px-3 py-2.5 transition hover:bg-ink-50",
                        session.cancelada && "opacity-60"
                      )}
                      style={{ borderLeftColor: session.discipline.color }}
                    >
                      <span className="w-20 shrink-0 text-sm font-semibold text-ink-800">{formatTimeKey(session.horaInicio)}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm font-medium text-ink-800", session.cancelada && "line-through")}>
                          {session.discipline.nombre}
                        </span>
                        {session.cancelada ? (
                          <span className="text-xs font-semibold text-rose-600">Cancelada</span>
                        ) : (
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-100">
                            <span className="block h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: session.discipline.color }} />
                          </span>
                        )}
                      </span>
                      {!session.cancelada ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-600">
                          <FiUsers className="size-3.5" />
                          {session.reservadas}/{session.cupo}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-ink-200 py-6 text-center text-sm text-ink-400">Hoy no hay clases programadas.</p>
          )}
        </section>

        <section className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="font-semibold text-ink-800">Para atender</h2>
          <ul className="mt-3 space-y-2">
            {tasks.map((task) => {
              const content = (
                <>
                  <span className={cn("flex size-4 shrink-0 [&>svg]:size-4", task.count ? "text-amber-500" : "text-ink-300")}>{task.icon}</span>
                  <span className="min-w-0 flex-1 text-sm text-ink-700">
                    <span className="font-bold">{task.count}</span> {task.label}
                  </span>
                </>
              );
              return (
                <li key={task.label}>
                  {task.href && task.count ? (
                    <Link href={task.href} className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5 hover:bg-amber-100">
                      {content}
                      <FiChevronRight className="size-4 text-amber-600" />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl bg-ink-50/70 px-3 py-2.5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <Link
            href="/dashboard/avisos"
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            <FiMessageCircle className="size-4" />
            Ir a Avisos
          </Link>
        </section>
      </div>

      <section className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="font-semibold text-ink-800">Reservas recientes en línea</h2>
        {data.recientes.length ? (
          <ul className="mt-3 divide-y divide-ink-100">
            {data.recientes.map((booking) => (
              <li key={booking.id}>
                <Link href={`/dashboard/clientes/${booking.member.id}`} className="flex items-center gap-3 py-2.5 hover:bg-ink-50/60">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: booking.discipline.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-800">
                      {booking.member.nombre} {booking.member.apellido ?? ""}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {booking.discipline.nombre} · {longDate(booking.fecha)} · {formatTimeKey(booking.horaInicio)}
                    </span>
                  </span>
                  {booking.estado === "CANCELADA" ? (
                    <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">Canceló</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-400">
            {pageUrl ? "Aún nadie ha reservado desde tu página. ¡Compártela!" : "Publica tu página para que tus clientes reserven solos."}
          </p>
        )}
      </section>
    </div>
  );
}
