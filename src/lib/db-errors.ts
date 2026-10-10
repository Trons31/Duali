import { Prisma } from "@prisma/client";

// Codigos de Prisma que significan "la base de datos no respondio", no "los datos
// estan mal". P1001/P1002: no alcanza el servidor. P1008/P1017: timeout o conexion
// cerrada. P2024: el pool se quedo sin conexiones libres.
const CONNECTION_ERROR_CODES = new Set(["P1000", "P1001", "P1002", "P1008", "P1010", "P1011", "P1017", "P2024"]);

/**
 * `instanceof` que nunca lanza. En el navegador (error.tsx y global-error.tsx
 * son de cliente) Prisma entrega sustitutos de sus clases: a veces no existen y
 * a veces son funciones sin `prototype`, y `instanceof` lanza un TypeError que
 * tapa el error original. Ver spec 018.
 */
export function safeInstanceOf(error: unknown, ctor: unknown): boolean {
  try {
    if (typeof ctor !== "function") return false;
    const prototype = (ctor as { prototype?: unknown }).prototype;
    if (typeof prototype !== "object" || prototype === null) return false;
    return error instanceof (ctor as new (...args: never[]) => unknown);
  } catch {
    return false;
  }
}

/** Por nombre: funciona en servidor y navegador, sin depender de las clases. */
function isPrismaError(error: unknown, name: string) {
  return (error as { name?: unknown }).name === name || Object.prototype.toString.call(error) === `[object ${name}]`;
}

function prismaClass(name: "PrismaClientInitializationError" | "PrismaClientRustPanicError" | "PrismaClientKnownRequestError") {
  try {
    return (Prisma as Record<string, unknown> | undefined)?.[name];
  } catch {
    return undefined;
  }
}

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  for (const name of ["PrismaClientInitializationError", "PrismaClientRustPanicError"] as const) {
    if (isPrismaError(error, name) || safeInstanceOf(error, prismaClass(name))) return true;
  }
  if (isPrismaError(error, "PrismaClientKnownRequestError") || safeInstanceOf(error, prismaClass("PrismaClientKnownRequestError"))) {
    const known = (error as { code?: unknown }).code;
    return typeof known === "string" && CONNECTION_ERROR_CODES.has(known);
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") {
    if (CONNECTION_ERROR_CODES.has(code)) return true;
    // Errores de red crudos de undici/node cuando ni siquiera hay DNS.
    if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
      return true;
    }
  }

  const raw = (error as { message?: unknown }).message;
  const message = typeof raw === "string" ? raw : "";
  if (/can'?t reach database server|connection pool|server has closed the connection|getaddrinfo|fetch failed/i.test(message)) {
    return true;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (cause && cause !== error) return isDatabaseConnectionError(cause);

  return false;
}

/**
 * Marca un error de conexion para que el error boundary lo reconozca. Next
 * serializa los errores del servidor al cliente y solo conserva `message`
 * y `digest`, asi que el digest es el unico canal confiable.
 */
export const DB_OFFLINE_DIGEST = "DB_OFFLINE";

/**
 * Marca el error original (sin reemplazarlo) para que el error boundary lo
 * reconozca. Se conserva el error de Prisma tal cual para que el stack del
 * servidor siga siendo util al depurar. Next respeta un `digest` ya presente
 * en vez de generar el suyo, asi que la marca sobrevive hasta el cliente.
 */
export function markAsOfflineIfConnectionError<T>(error: T): T {
  if (isDatabaseConnectionError(error) && error && typeof error === "object") {
    const marked = error as { digest?: string };
    if (!marked.digest) marked.digest = DB_OFFLINE_DIGEST;
  }
  return error;
}

export function isOfflineDigest(error: { digest?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.digest?.startsWith(DB_OFFLINE_DIGEST)) return true;
  return isDatabaseConnectionError(error);
}
