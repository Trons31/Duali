import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import type { Client, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./http";
import { allows, normalizePermissions, requirementForApi, type Access } from "./collaborator-permissions";

export type JwtPayload = {
  /** El negocio (clients.id). */
  sub: string;
  email: string;
  /** Spec 024: el colaborador que entro; sin el, es la dueña. */
  col?: string;
};


const jwtSecret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(client: Pick<Client, "id" | "email">, collaboratorId?: string | null) {
  const options: SignOptions = { expiresIn: jwtExpiresIn as SignOptions["expiresIn"] };
  const payload: JwtPayload = { sub: client.id, email: client.email, ...(collaboratorId ? { col: collaboratorId } : {}) };
  return jwt.sign(payload, jwtSecret, options);
}

export function sanitizeClient<T extends { passwordHash?: string }>(client: T) {
  const { passwordHash, ...safeClient } = client;
  return safeClient;
}

export const authClientSelect = {
  id: true,
  nombre: true,
  email: true,
  passwordHash: true,
  telefono: true,
  businessName: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true
} satisfies Prisma.ClientSelect;

export async function requireClient(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) throw new ApiError(401, "No autenticado");

  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;
    const client = await prisma.client.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: authClientSelect
    });

    if (!client) throw new ApiError(401, "Cliente no encontrado");

    let access: Access = { kind: "OWNER" };
    let collaboratorId: string | null = null;
    if (payload.col) {
      // Spec 024 R7: desactivado, pierde el acceso en esta misma peticion.
      const collaborator = await prisma.collaborator.findFirst({
        where: { id: payload.col, clientId: client.id, activo: true },
        select: { id: true, rol: true, permisos: true }
      });
      if (!collaborator) throw new ApiError(401, "Tu acceso fue desactivado");
      access = { kind: "COLLABORATOR", role: collaborator.rol, permissions: normalizePermissions(collaborator.permisos) };
      collaboratorId = collaborator.id;
      // Spec 024 R5: la API es la que manda; lo que no esta en el mapa es de la dueña.
      const { pathname } = new URL(request.url);
      if (!allows(access, requirementForApi(pathname, request.method))) {
        throw new ApiError(403, "No tienes permiso para esto. Pídeselo a la dueña del negocio.");
      }
    }

    return {
      clientId: client.id,
      client,
      safeClient: sanitizeClient(client),
      access,
      collaboratorId
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Token inválido o expirado");
  }
}
