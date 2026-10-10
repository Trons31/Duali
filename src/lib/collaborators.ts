import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import { countPermissions, normalizePermissions } from "@/lib/collaborator-permissions";
import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { CollaboratorInput } from "@/lib/validations";

// Colaboradores con acceso (spec 024 R3): solo la dueña los crea y edita. Las
// rutas no estan en el mapa de permisos, asi que un colaborador recibe 403.

type Row = Prisma.CollaboratorGetPayload<object>;

export function serializeCollaborator(row: Row) {
  const permisos = normalizePermissions(row.permisos);
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    celular: row.celular,
    rol: row.rol,
    permisos,
    cantidadPermisos: row.rol === "SOCIO" ? null : countPermissions(permisos),
    activo: row.activo,
    ultimoAcceso: row.ultimoAcceso?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

export type CollaboratorView = ReturnType<typeof serializeCollaborator>;

export async function listCollaborators(clientId: string) {
  const rows = await prisma.collaborator.findMany({ where: { clientId }, orderBy: [{ activo: "desc" }, { nombre: "asc" }] });
  return rows.map(serializeCollaborator);
}

/** R3: un correo es de un solo negocio o colaborador. */
async function assertEmailFree(email: string, exceptId?: string) {
  const [client, collaborator] = await Promise.all([
    prisma.client.findUnique({ where: { email }, select: { id: true } }),
    prisma.collaborator.findUnique({ where: { email }, select: { id: true } })
  ]);
  if (client || (collaborator && collaborator.id !== exceptId)) throw new ApiError(409, "Ese correo ya está en uso");
}

function permissionsFor(input: Pick<CollaboratorInput, "rol" | "permisos">) {
  // El socio tiene todo por su rol; no se guardan permisos sueltos.
  return (input.rol === "ADMIN" ? normalizePermissions(input.permisos) : {}) as Prisma.InputJsonValue;
}

export async function createCollaborator(clientId: string, input: CollaboratorInput) {
  if (!input.password) throw new ApiError(422, "Escribe una contraseña de al menos 8 caracteres");
  await assertEmailFree(input.email);
  try {
    const row = await prisma.collaborator.create({
      data: {
        clientId,
        nombre: input.nombre,
        email: input.email,
        celular: input.celular,
        rol: input.rol,
        permisos: permissionsFor(input),
        passwordHash: await hashPassword(input.password)
      }
    });
    return serializeCollaborator(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError(409, "Ese correo ya está en uso");
    throw error;
  }
}

/** R3/R7: editar, cambiar la contraseña (opcional) y activar o desactivar. */
export async function updateCollaborator(clientId: string, id: string, input: CollaboratorInput) {
  const current = await prisma.collaborator.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!current) throw new ApiError(404, "Colaborador no encontrado");
  await assertEmailFree(input.email, id);
  const row = await prisma.collaborator.update({
    where: { id },
    data: {
      nombre: input.nombre,
      email: input.email,
      celular: input.celular,
      rol: input.rol,
      permisos: permissionsFor(input),
      ...(input.activo !== undefined ? { activo: input.activo } : {}),
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {})
    }
  });
  return serializeCollaborator(row);
}

export async function setCollaboratorActive(clientId: string, id: string, activo: boolean) {
  const updated = await prisma.collaborator.updateMany({ where: { id, clientId }, data: { activo } });
  if (!updated.count) throw new ApiError(404, "Colaborador no encontrado");
  return serializeCollaborator(await prisma.collaborator.findUniqueOrThrow({ where: { id } }));
}

/** Lo que el panel necesita del que entro: rol y permisos al dia (no los del inicio de sesion). */
export async function getCollaboratorAccess(clientId: string, collaboratorId: string) {
  const row = await prisma.collaborator.findFirst({ where: { id: collaboratorId, clientId, activo: true } });
  return row ? { id: row.id, nombre: row.nombre, rol: row.rol, permisos: normalizePermissions(row.permisos) } : null;
}
