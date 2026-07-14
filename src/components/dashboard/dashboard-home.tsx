import Link from "next/link";
import {
  FiBookOpen,
  FiCalendar,
  FiChevronRight,
  FiClock,
  FiDollarSign,
  FiUsers
} from "react-icons/fi";
import { cn, currency } from "@/lib/web-utils";
import type { AccountingSummary, GroupSummary } from "@/lib/web-types";

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
  userName,
  businessName,
  summary,
  pending,
  groups
}: {
  userName?: string | null;
  businessName: string;
  summary: AccountingSummary;
  pending: DueItem[];
  groups: GroupSummary[];
}) {
  const dueTodayAmount = pending.reduce((sum, item) => sum + Number(item.monto ?? 0), 0);
  const dueTodayCount = pending.length;
  const activeGroups = groups.slice(0, 4).map((group) => {
    const activeStudents = group.students.filter((student) => student.estado === "ACTIVO");
    const estimated = activeStudents.reduce((sum, student) => sum + Number(student.precioMensualidad ?? 0), 0);

    return {
      id: group.id,
      nombre: group.nombre,
      activeStudents: activeStudents.length,
      estimated
    };
  });

  const displayName = userName?.trim() || "Admin";
  const firstName = displayName.split(" ")[0] || "Admin";

  return (
    <div className="min-h-[calc(100vh-7rem)]">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[24px] border border-ink-100 bg-white px-6 py-8 shadow-sm sm:px-8 lg:px-10">
          <div className="flex items-center justify-between gap-8">
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink-500">{businessName}</p>
              <h1 className="mt-3 text-[2rem] font-black leading-tight text-ink-950 sm:text-[2.35rem]">
                Hola, {firstName}
              </h1>
              <p className="mt-3 max-w-md text-sm font-medium text-ink-500">Este es el resumen de tu negocio hoy.</p>
            </div>

            <div className="hidden w-72 shrink-0 items-center justify-end lg:flex" aria-hidden="true">
              <div className="relative h-28 w-44 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 shadow-sm">
                <div className="mb-5 h-1.5 w-14 rounded-full bg-brand-400" />
                <div className="space-y-3">
                  <div className="h-1.5 w-full rounded-full bg-brand-100" />
                  <div className="h-1.5 w-4/5 rounded-full bg-brand-200" />
                  <div className="h-1.5 w-11/12 rounded-full bg-brand-300" />
                </div>
                <div className="absolute -bottom-4 -right-4 flex size-11 items-center justify-center rounded-full bg-brand-600 text-lg font-black text-white shadow-sm">
                  $
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <HomeStatCard
            title="Cobrado este mes"
            value={currency(summary.pagosRecibidosEsteMes + summary.ingresosInscripciones)}
            helper="mensualidades e inscripciones"
            tone="success"
            icon={<FiDollarSign className="size-5" />}
          />
          <HomeStatCard
            title="Vence hoy"
            value={currency(dueTodayAmount)}
            helper={`${dueTodayCount} cobros pendientes`}
            tone="warning"
            icon={<FiClock className="size-5" />}
          />
          <HomeStatCard
            title="Alumnos activos"
            value={String(summary.estudiantesActivos)}
            helper="en tus grupos"
            tone="blue"
            icon={<FiUsers className="size-5" />}
          />
          <HomeStatCard
            title="Balance"
            value={currency(summary.balance)}
            helper="ingresos - egresos"
            tone="purple"
            icon={<FiDollarSign className="size-5" />}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <div className="rounded-[24px] border border-ink-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-ink-950">Grupos activos</h2>
              <Link href="/dashboard/grupos" className="text-sm font-bold text-brand-600">
                Gestionar
              </Link>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {activeGroups.map((group) => (
                <Link
                  key={group.id}
                  href={`/dashboard/grupos/${group.id}`}
                  className="rounded-2xl border border-ink-100 bg-white px-4 py-4 shadow-sm transition hover:border-brand-100 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-lg font-black text-brand-600">
                      {group.nombre.charAt(0).toUpperCase()}
                    </div>
                    <FiChevronRight className="mt-3 size-4 text-ink-300" />
                  </div>
                  <h3 className="mt-4 truncate text-sm font-black text-ink-950">{group.nombre}</h3>
                  <p className="mt-2 text-xs font-semibold text-ink-500">{group.activeStudents} alumnos</p>
                  <p className="mt-3 text-lg font-black text-brand-600">{currency(group.estimated)}</p>
                  <p className="mt-1 text-xs text-ink-500">estimado mensual</p>
                </Link>
              ))}

              {!activeGroups.length ? (
                <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-4 py-8 text-sm text-ink-500 sm:col-span-2">
                  Aun no tienes grupos activos para mostrar aqui.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-ink-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-ink-950">Mensualidades a vencer</h2>
              <Link href="/dashboard/cobros/pendientes" className="text-sm font-bold text-brand-600">
                Ver todas
              </Link>
            </div>

            {pending.length ? (
              <div className="mt-5 space-y-3">
                {pending.slice(0, 3).map((item) => (
                  <article key={item.id} className="rounded-2xl border border-ink-100 bg-white px-4 py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                        <FiCalendar className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-ink-950">
                              {item.student.nombre} {item.student.apellido}
                            </p>
                            <p className="mt-1 text-xs text-ink-500">
                              Vence {formatMobileDate(item.fechaVencimiento)} · {item.group?.nombre ?? "Sin grupo"}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-black text-brand-600">{currency(item.monto)}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <div className="flex size-20 items-center justify-center rounded-3xl bg-[#eef4ff] text-[#b8c8f5]">
                  <FiBookOpen className="size-10" />
                </div>
                <p className="mt-6 text-base font-bold text-ink-600">No tienes mensualidades pendientes</p>
                <p className="mt-2 text-sm text-ink-500">Todo al dia.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function HomeStatCard({
  title,
  value,
  helper,
  tone,
  icon
}: {
  title: string;
  value: string;
  helper: string;
  tone: "success" | "warning" | "blue" | "purple";
  icon: React.ReactNode;
}) {
  const styles = {
    success: { icon: "bg-emerald-50 text-emerald-600", value: "text-emerald-700" },
    warning: { icon: "bg-amber-50 text-amber-500", value: "text-amber-500" },
    blue: { icon: "bg-blue-50 text-blue-600", value: "text-blue-600" },
    purple: { icon: "bg-violet-50 text-violet-600", value: "text-violet-600" }
  }[tone];

  return (
    <article className="flex h-[152px] min-w-0 flex-col rounded-2xl border border-ink-100 bg-white p-3 shadow-sm transition hover:shadow-md sm:h-auto sm:min-h-0 sm:rounded-[24px] sm:p-6">
      <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-start gap-2 sm:flex sm:gap-4">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-12 sm:rounded-2xl",
            styles.icon
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="min-h-8 text-[11px] font-bold leading-4 text-ink-500 sm:min-h-0 sm:text-sm">{title}</p>
          <p
            className={cn(
              "mt-1.5 break-words text-lg font-black leading-none sm:mt-3 sm:text-2xl",
              styles.value
            )}
          >
            {value}
          </p>
        </div>
      </div>

      <div className="mt-auto flex min-w-0 items-end justify-between gap-1.5 pt-3 sm:items-center sm:gap-3 sm:pt-8">
        <p className="min-w-0 text-[11px] font-medium leading-4 text-ink-500 sm:truncate sm:text-sm">{helper}</p>
        <FiChevronRight className="size-3.5 shrink-0 text-ink-300 sm:size-4" />
      </div>
    </article>
  );
}

function formatMobileDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("es-CO");
}
