import { CollaboratorsHub } from "@/components/dashboard/collaborators-hub";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import type { CollaboratorView } from "@/lib/collaborators";
import type { InstructorView } from "@/lib/instructors";
import { can, getPageAccess } from "@/lib/page-access";
import { apiFetch } from "@/lib/server-api";
import { auth } from "@/lib/web-auth";
import type { DisciplineItem } from "@/lib/web-types";

/** Spec 024 R1: instructores, administradores y socios, como Colaboradores de CliqCut. */
export default async function CollaboratorsPage() {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Colaboradores" />;

  const access = await getPageAccess();
  const isOwner = access.kind === "OWNER";
  const canEditTeam = can(access, "EQUIPO");
  const [instructors, disciplines, unregistered, collaborators] = await Promise.all([
    apiFetch<InstructorView[]>("/api/instructors"),
    apiFetch<DisciplineItem[]>("/api/disciplines"),
    canEditTeam ? apiFetch<string[]>("/api/instructors/import").catch(() => []) : Promise.resolve([]),
    isOwner ? apiFetch<CollaboratorView[]>("/api/collaborators") : Promise.resolve([])
  ]);

  return (
    <CollaboratorsHub
      instructors={instructors}
      // Los instructores dan clases: los combos no tienen horario propio.
      disciplines={disciplines.filter((discipline) => discipline.tipo === "CLASE" && discipline.activa)}
      unregistered={unregistered}
      collaborators={collaborators}
      isOwner={isOwner}
      canEditTeam={canEditTeam}
    />
  );
}
