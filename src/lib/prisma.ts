import "./prisma-debug";
import { PrismaClient } from "@prisma/client";
import { markAsOfflineIfConnectionError } from "./db-errors";

type PrismaGlobal = {
  prisma?: ExtendedPrismaClient;
  databaseUrl?: string;
};

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as PrismaGlobal;
const databaseUrl = buildDatabaseUrl();
const databaseKey = databaseUrl ?? "default";
const mustCreateClient = !globalForPrisma.prisma || globalForPrisma.databaseUrl !== databaseKey;

if (mustCreateClient && globalForPrisma.prisma) {
  void globalForPrisma.prisma.$disconnect();
}

function createPrismaClient() {
  return new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    transactionOptions: {
      maxWait: 5_000,
      timeout: 10_000
    }
  }).$extends({
    query: {
      // Un unico punto para TODAS las consultas: si la base de datos no responde
      // el error sale ya marcado como "sin conexion", sin tener que envolver
      // cada llamada a mano (son mas de 150 en el proyecto).
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          throw markAsOfflineIfConnectionError(error);
        }
      }
    }
  });
}

export const prisma: ExtendedPrismaClient =
  !mustCreateClient && globalForPrisma.prisma ? globalForPrisma.prisma : createPrismaClient();

// Se cachea SIEMPRE (tambien en produccion). En Vercel/Fluid las instancias
// quedan calientes y atienden varias rutas: sin este cache cada bundle crea su
// propio PrismaClient (motor + pool propios) dentro del mismo proceso.
globalForPrisma.prisma = prisma;
globalForPrisma.databaseUrl = databaseKey;

function buildDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (!url.protocol.startsWith("postgres")) return value;

    const minimumConnectionLimit = positiveInteger(
      process.env.PRISMA_CONNECTION_LIMIT,
      process.env.NODE_ENV === "production" ? 1 : 10
    );
    const requestedConnectionLimit = positiveInteger(url.searchParams.get("connection_limit"), 0);
    const requestedPoolTimeout = positiveInteger(url.searchParams.get("pool_timeout"), 0);

    url.searchParams.set("connection_limit", String(Math.max(requestedConnectionLimit, minimumConnectionLimit)));
    // Fallar rapido: en serverless esperar 60s por una conexion significa 60s de
    // memoria provisionada facturada por cada request que no consigue pool.
    url.searchParams.set("pool_timeout", String(requestedPoolTimeout || 10));
    if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "5");

    return url.toString();
  } catch {
    return value;
  }
}

function positiveInteger(value: string | null | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
