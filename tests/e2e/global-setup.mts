/**
 * Pruebas de punta a punta: la base temporal de las funcionales + la app real
 * (`next dev`) en un puerto libre, con su propia carpeta de compilación.
 */
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { globalSetup as startDatabase, globalTeardown as stopDatabase } from "../functional/global-setup.mts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let app: ChildProcess | null = null;

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function waitFor(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Todavia no escucha.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`La app no respondió en ${timeoutMs / 1000}s: ${url}`);
}

export async function globalSetup() {
  await startDatabase();
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  app = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "--port", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      // Las variables explicitas ganan sobre el .env: la app usa la base temporal.
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      NEXTAUTH_SECRET: process.env.JWT_SECRET,
      NEXTAUTH_URL: baseUrl,
      AUTH_URL: baseUrl,
      NEXT_PUBLIC_BASE_URL: baseUrl,
      ADMIN_EMAIL: "",
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  // La salida completa del servidor queda en .next-e2e/e2e-server.log para diagnosticar fallas.
  mkdirSync(path.join(ROOT, ".next-e2e"), { recursive: true });
  const log = createWriteStream(path.join(ROOT, ".next-e2e", "e2e-server.log"));
  const keep = (chunk: Buffer) => {
    log.write(chunk);
    output = (output + chunk).slice(-4000);
  };
  app.stdout?.on("data", keep);
  app.stderr?.on("data", keep);

  try {
    await waitFor(`${baseUrl}/auth/login`, 180_000);
  } catch (error) {
    await globalTeardown();
    throw new Error(`${(error as Error).message}\n${output}`);
  }

  process.env.E2E_BASE_URL = baseUrl;
}

export async function globalTeardown() {
  if (app?.pid) {
    // next dev levanta procesos hijos: en Windows hay que cerrar el arbol entero.
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: "ignore" });
      } catch {
        // Ya habia terminado.
      }
    } else {
      app.kill("SIGTERM");
    }
  }
  await stopDatabase();
}
