import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isDatabaseConnectionError } from "./db-errors";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function handleError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: "Datos inválidos", details: error.flatten() },
      { status: 422 }
    );
  }

  // 503 + Retry-After: el cliente puede distinguir "no hay conexion" de un bug
  // real y mostrar la vista sin conexion en lugar de un error generico.
  if (isDatabaseConnectionError(error)) {
    return NextResponse.json(
      { ok: false, error: "Sin conexión con la base de datos. Intenta de nuevo en unos segundos.", code: "DB_OFFLINE" },
      { status: 503, headers: { "Retry-After": "10" } }
    );
  }

  console.error(error);
  return NextResponse.json({ ok: false, error: "Error interno del servidor" }, { status: 500 });
}

export async function readBody<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "Body JSON inválido");
  }
}
