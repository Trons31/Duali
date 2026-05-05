import Link from "next/link";
import { FiArrowRight, FiCalendar, FiClock, FiDollarSign, FiTrendingUp, FiUsers } from "react-icons/fi";
import { currency } from "@/lib/web-utils";
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
  const activeGroups = groups.slice(0, 3).map((group) => {
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
  const avatarLetter = businessName.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-5rem)] bg-white px-4 py-6 sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[28px] border border-ink-100 bg-white px-5 py-5 shadow-soft sm:px-6 sm:py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-ink-400">{businessName}</p>
              <h1 className="mt-2 text-[2rem] font-black leading-none tracking-tight text-ink-950 sm:text-[2.45rem]">
                Hola, {firstName}
              </h1>
            </div>
            <div className="flex size-[82px] shrink-0 items-center justify-center rounded-[28px] bg-brand-600 text-[2.25rem] font-black text-white">
              {avatarLetter}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:gap-4">
          <HomeStatCard
            title="Cobrado este mes"
            value={currency(summary.pagosRecibidosEsteMes + summary.ingresosInscripciones)}
            helper="mensualidades e inscripciones"
            tone="success"
            icon={<FiTrendingUp className="size-4" />}
          />
          <HomeStatCard
            title="Vence hoy"
            value={currency(dueTodayAmount)}
            helper={`${dueTodayCount} cobros pendientes`}
            tone="warning"
            icon={<FiClock className="size-4" />}
          />
          <HomeStatCard
            title="Alumnos activos"
            value={String(summary.estudiantesActivos)}
            helper="en tus grupos"
            tone="blue"
            icon={<FiUsers className="size-4" />}
          />
          <HomeStatCard
            title="Balance"
            value={currency(summary.balance)}
            helper="ingresos - egresos"
            tone="purple"
            icon={<FiDollarSign className="size-4" />}
          />
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-[1.15rem] font-black tracking-tight text-ink-950 sm:text-[1.3rem]">Mensualidades a vencer</h2>
            <Link href="/dashboard/cobros/pendientes" className="text-sm font-bold text-brand-600">
              Ver todas
            </Link>
          </div>

          {pending.length ? (
            <div className="space-y-3">
              {pending.slice(0, 3).map((item) => (
                <article key={item.id} className="rounded-[24px] border border-ink-100 bg-white px-4 py-4 shadow-soft">
                  <div className="flex items-center gap-4">
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-[20px] bg-brand-50 text-brand-600">
                      <FiCalendar className="size-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-bold text-ink-950">
                            {item.student.nombre} {item.student.apellido}
                          </p>
                          <p className="mt-1 text-[12px] text-ink-500">
                            Vence {formatMobileDate(item.fechaVencimiento)} · {item.group?.nombre ?? "Sin grupo"}
                          </p>
                        </div>
                        <p className="shrink-0 text-[14px] font-black text-brand-600">{currency(item.monto)}</p>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-ink-100 bg-white px-4 py-8 text-sm text-ink-500 shadow-soft">
              No tienes mensualidades pendientes para hoy.
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-[1.15rem] font-black tracking-tight text-ink-950 sm:text-[1.3rem]">Grupos activos</h2>
            <Link href="/dashboard/grupos" className="text-sm font-bold text-brand-600">
              Gestionar
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeGroups.map((group) => (
              <Link
                key={group.id}
                href={`/dashboard/grupos/${group.id}`}
                className="rounded-[24px] border border-ink-100 bg-white px-4 py-4 shadow-soft transition hover:border-ink-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-14 items-center justify-center rounded-[18px] bg-brand-50 text-[1.25rem] font-black text-brand-600">
                    {group.nombre.charAt(0).toUpperCase()}
                  </div>
                  <FiArrowRight className="mt-1 size-5 text-ink-300" />
                </div>
                <h3 className="mt-4 text-[15px] font-bold text-ink-950">{group.nombre}</h3>
                <p className="mt-2 text-[13px] font-semibold text-ink-500">{group.activeStudents} alumnos</p>
                <p className="mt-2 text-[15px] font-black text-brand-600">{currency(group.estimated)}</p>
                <p className="mt-1 text-[12px] text-ink-500">estimado mensual</p>
              </Link>
            ))}

            {!activeGroups.length ? (
              <div className="rounded-[24px] border border-dashed border-ink-200 bg-white px-4 py-8 text-sm text-ink-500 shadow-soft sm:col-span-2 xl:col-span-3">
                Aún no tienes grupos activos para mostrar aquí.
              </div>
            ) : null}
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
    success: { card: "bg-emerald-50", value: "text-brand-600", icon: "text-brand-600" },
    warning: { card: "bg-amber-50", value: "text-amber-500", icon: "text-amber-500" },
    blue: { card: "bg-sky-50", value: "text-sky-600", icon: "text-sky-600" },
    purple: { card: "bg-violet-50", value: "text-violet-600", icon: "text-violet-600" }
  }[tone];

  return (
    <article className={`rounded-[24px] border border-ink-100 px-4 py-4 shadow-soft ${styles.card}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold leading-snug text-ink-500">{title}</p>
        <div className={styles.icon}>{icon}</div>
      </div>
      <p className={`mt-4 text-[1.15rem] font-black leading-none tracking-tight sm:text-[1.35rem] ${styles.value}`}>{value}</p>
      <p className="mt-3 text-[12px] font-semibold leading-snug text-ink-500">{helper}</p>
    </article>
  );
}

function formatMobileDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("es-CO");
}
