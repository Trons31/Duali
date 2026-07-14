import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import type { Client, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./http";

export type JwtPayload = {
  sub: string;
  email: string;
};

const jwtSecret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(client: Pick<Client, "id" | "email">) {
  const options: SignOptions = { expiresIn: jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign({ sub: client.id, email: client.email } satisfies JwtPayload, jwtSecret, options);
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

    return {
      clientId: client.id,
      client,
      safeClient: sanitizeClient(client)
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Token inválido o expirado");
  }
}
