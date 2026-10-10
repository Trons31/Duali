/**
 * Arranque de las pruebas funcionales: levanta un PostgreSQL real y temporal
 * (embedded-postgres), aplica TODAS las migraciones desde cero y deja la URL en
 * process.env para los archivos de prueba.
 *
 * Seguridad: la base de producción nunca se toca. Las migraciones corren contra
 * una COPIA del esquema con la URL local escrita a mano (sin env("DATABASE_URL")
 * ni directUrl), así que ni el .env ni DIRECT_URL pueden redirigirlas.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let pg: EmbeddedPostgres | null = null;
let workDir = "";

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

export async function globalSetup() {
  workDir = mkdtempSync(path.join(tmpdir(), "duali-test-"));
  const port = await freePort();
  const password = "duali-test";

  pg = new EmbeddedPostgres({
    databaseDir: path.join(workDir, "data"),
    user: "postgres",
    password,
    port,
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("duali_test");

  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/duali_test`;

  // Esquema temporal con la URL local fija.
  const schemaDir = path.join(workDir, "prisma");
  cpSync(path.join(ROOT, "prisma", "migrations"), path.join(schemaDir, "migrations"), { recursive: true });
  const schema = readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8").replace(
    /datasource db \{[\s\S]*?\}/,
    `datasource db {\n  provider = "postgresql"\n  url      = "${url}"\n}`
  );
  if (!schema.includes(url) || /env\("(DATABASE_URL|DIRECT_URL)"\)/.test(schema)) {
    throw new Error("No se pudo fijar la URL local en el esquema de pruebas; se aborta por seguridad.");
  }
  writeFileSync(path.join(schemaDir, "schema.prisma"), schema);

  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execFileSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", path.join(schemaDir, "schema.prisma")],
    { cwd: workDir, env, stdio: "pipe" }
  );

  // Los archivos de prueba se lanzan despues, heredando estas variables.
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  process.env.DUALI_TEST_DB_PORT = String(port);
  process.env.JWT_SECRET = "duali-functional-tests";
  process.env.PRISMA_CONNECTION_LIMIT = "5";
  // Cloudinary falso: la firma se calcula sin red y no se llama a su API.
  process.env.CLOUDINARY_CLOUD_NAME = "duali-test";
  process.env.CLOUDINARY_API_KEY = "000000";
  process.env.CLOUDINARY_API_SECRET = "secreto-de-pruebas";
  process.env.DUALI_MEDIA_OFFLINE = "1";
  // Prisma carga el .env para las variables que falten: se fijan aqui las que
  // las pruebas usan, para no heredar valores reales.
  process.env.CRON_SECRET = "cron-de-pruebas";
  process.env.NEXTAUTH_SECRET = process.env.JWT_SECRET;
}

export async function globalTeardown() {
  await pg?.stop().catch(() => undefined);
  if (workDir) rmSync(workDir, { recursive: true, force: true });
}
