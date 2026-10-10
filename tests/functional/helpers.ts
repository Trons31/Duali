/**
 * Utilidades de las pruebas funcionales. Llaman a los route handlers reales
 * (los mismos que atiende Next) con un Request y un token JWT valido, contra la
 * base temporal que levanta global-setup.ts.
 */
import assert from "node:assert/strict";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const port = process.env.DUALI_TEST_DB_PORT;
const databaseUrl = process.env.DATABASE_URL ?? "";

// Doble seguro: si algo cambio la URL, ninguna prueba toca otra base. Prisma no
// se conecta al importarse, solo en la primera consulta, que llega despues.
if (!port || !databaseUrl.startsWith(`postgresql://postgres:duali-test@127.0.0.1:${port}/duali_test`)) {
  throw new Error("Las pruebas funcionales solo corren contra la base temporal local (usa npm run test:functional).");
}

export { prisma };

type Handler = (request: Request, context: { params: Promise<any> }) => Promise<Response>;

export type ApiResult<T = any> = { status: number; body: { ok: boolean; data: T; error?: string } };

export async function call<T = any>(
  handler: Handler,
  options: { token: string; method?: string; path?: string; body?: unknown; params?: Record<string, string> }
): Promise<ApiResult<T>> {
  const request = new Request(`http://localhost${options.path ?? "/"}`, {
    method: options.method ?? "GET",
    headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const response = await handler(request, { params: Promise.resolve(options.params ?? {}) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : { ok: response.ok, data: undefined } };
}

/** Comprueba el status y devuelve data; si falla, muestra el error de la API. */
export function expectOk<T>(result: ApiResult<T>, status = 200): T {
  assert.equal(result.status, status, `Esperaba ${status} y llegó ${result.status}: ${JSON.stringify(result.body)}`);
  return result.body.data;
}

export function expectError(result: ApiResult, status: number, message?: RegExp) {
  assert.equal(result.status, status, `Esperaba ${status} y llegó ${result.status}: ${JSON.stringify(result.body)}`);
  if (message) assert.match(result.body.error ?? "", message);
}

let counter = 0;

/** Un negocio nuevo y aislado por prueba, con su token de API. */
export async function createBusiness(overrides: { moduloEstudio?: boolean; moduloAcademia?: boolean } = {}) {
  counter += 1;
  const client = await prisma.client.create({
    data: {
      nombre: "Dueña Prueba",
      email: `negocio-${Date.now()}-${counter}@test.duali`,
      passwordHash: "x",
      businessName: `Estudio ${counter}`,
      moduloEstudio: overrides.moduloEstudio ?? true,
      moduloAcademia: overrides.moduloAcademia ?? true
    }
  });
  return { client, token: signToken(client) };
}

export async function disconnect() {
  await prisma.$disconnect();
}
