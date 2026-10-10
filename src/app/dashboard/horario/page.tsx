import { ClassSchedulePanel } from "@/components/dashboard/class-schedule-panel";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import { apiFetch } from "@/lib/server-api";
import { addDaysToKey, isDateKey, startOfWeekKey, studioTodayKey } from "@/lib/studio-time";
import { auth } from "@/lib/web-auth";
import type { ClassScheduleItem, ClassSessionItem, DisciplineItem } from "@/lib/web-types";

export default async function ClassSchedulePage({
  searchParams
}: {
  searchParams: Promise<{ semana?: string; vista?: string; fecha?: string }>
}) {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Horario de clases" />;

  const { semana, vista, fecha } = await searchParams;
  const today = studioTodayKey();
  const weekStart = startOfWeekKey(semana && isDateKey(semana) ? semana : today);
  const weekEnd = addDaysToKey(weekStart, 6);

  const [sessions, schedules, disciplines] = await Promise.all([
    apiFetch<ClassSessionItem[]>(`/api/class-sessions?from=${weekStart}&to=${weekEnd}`),
    apiFetch<ClassScheduleItem[]>("/api/class-schedules"),
    apiFetch<DisciplineItem[]>("/api/disciplines")
  ]);

  return (
    <ClassSchedulePanel
      today={today}
      weekStart={weekStart}
      initialView={vista === "horarios" || vista === "asistencia" ? vista : "semana"}
      attendanceDate={fecha && isDateKey(fecha) ? fecha : undefined}
      sessions={sessions}
      schedules={schedules}
      disciplines={disciplines.filter((discipline) => discipline.tipo === "CLASE" && discipline.activa)}
    />
  );
}
