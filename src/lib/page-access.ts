import { allows, normalizePermissions, type Access, type Requirement } from "@/lib/collaborator-permissions";
import { getCollaboratorAccess } from "@/lib/collaborators";
import { auth } from "@/lib/web-auth";

/** Spec 024: quien mira la pagina (la dueña o un colaborador con sus permisos al dia). */
export async function getPageAccess(): Promise<Access> {
  const session = await auth();
  const collaboratorId = session?.user?.collaboratorId;
  if (!session?.user?.id || !collaboratorId) return { kind: "OWNER" };
  const collaborator = await getCollaboratorAccess(session.user.id, collaboratorId);
  // Sin acceso, el layout ya lo manda al login; aqui no se le da nada.
  if (!collaborator) return { kind: "COLLABORATOR", role: "ADMIN", permissions: normalizePermissions({}) };
  return { kind: "COLLABORATOR", role: collaborator.rol, permissions: collaborator.permisos };
}

export function can(access: Access, requirement: Requirement | Requirement[]) {
  return allows(access, requirement);
}
