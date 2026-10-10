/**
 * Catalogo de Studio Dance (specs 004 R5 y 016): las historias de Instagram con
 * sus precios. Lo usan scripts/seed-studio-catalog.ts y scripts/seed-demo-studio.ts.
 */
import type { PrismaClient } from "@prisma/client";

export const CLASSES = [
  { nombre: "Body Combat", color: "#f43f5e" },
  { nombre: "Rumba Fit", color: "#f97316" },
  { nombre: "Jump Power", color: "#0ea5e9" }
] as const;

export const COMBO = {
  nombre: "Mix Studio",
  color: "#a855f7",
  descripcion: "Rumba Fit + Jump Power + Body Combat",
  incluye: CLASSES.map((item) => item.nombre)
};

// [paquete, clases al mes, Body Combat, Rumba Fit, Jump Power, Mix Studio]; null = no se ofrece.
export const PRICE_TABLE: Array<[string, number, number, number, number, number | null]> = [
  ["Individual", 1, 15_000, 15_000, 18_000, null],
  ["Básico", 4, 55_000, 55_000, 65_000, 60_000],
  ["Plus", 8, 110_000, 110_000, 130_000, 120_000],
  ["Premium", 12, 160_000, 160_000, 180_000, 170_000],
  ["Full Studiodance", 20, 270_000, 270_000, 320_000, 290_000]
];

type CatalogDb = Pick<PrismaClient, "discipline" | "package">;

/**
 * Aditivo e idempotente: crea lo que falta y nunca borra. Lo que ya existe con
 * el mismo nombre se respeta tal cual, salvo el precio y las clases de un paquete
 * cuando se pide `ajustarPrecios` (solo el estudio demo).
 * Sin `apply` solo informa lo que haria. Devuelve los ids por nombre en minusculas.
 */
export async function ensureStudioCatalog(
  db: CatalogDb,
  clientId: string,
  options: { apply: boolean; log?: (line: string) => void; /** Lleva al precio y clases de la tabla los paquetes que ya existen con el mismo nombre. */ ajustarPrecios?: boolean }
) {
  const log = options.log ?? console.log;
  const existing = await db.discipline.findMany({ where: { clientId, deletedAt: null }, select: { id: true, nombre: true } });
  const idByName = new Map(existing.map((item) => [item.nombre.toLocaleLowerCase("es"), item.id]));

  async function ensureDiscipline(nombre: string, color: string, orden: number, combo?: { incluye: string[]; descripcion: string }) {
    const key = nombre.toLocaleLowerCase("es");
    if (idByName.has(key)) {
      log(`  = ${nombre} ya existe`);
      return;
    }

    log(`  + ${combo ? "combo" : "disciplina"} ${nombre}`);
    if (!options.apply) {
      idByName.set(key, `pendiente:${nombre}`);
      return;
    }

    const created = await db.discipline.create({
      data: {
        clientId,
        tipo: combo ? "COMBO" : "CLASE",
        nombre,
        color,
        orden,
        descripcion: combo?.descripcion ?? null,
        comboItems: combo
          ? { create: combo.incluye.map((name) => ({ disciplineId: idByName.get(name.toLocaleLowerCase("es"))! })) }
          : undefined
      },
      select: { id: true }
    });
    idByName.set(key, created.id);
  }

  for (const [index, item] of CLASSES.entries()) await ensureDiscipline(item.nombre, item.color, index);
  await ensureDiscipline(COMBO.nombre, COMBO.color, CLASSES.length, COMBO);

  const columns = [...CLASSES.map((item) => item.nombre), COMBO.nombre];
  const existingPackages = await db.package.findMany({
    where: { clientId, deletedAt: null },
    select: { id: true, disciplineId: true, nombre: true, clases: true, precio: true }
  });
  const packageByKey = new Map(existingPackages.map((item) => [`${item.disciplineId}|${item.nombre.toLocaleLowerCase("es")}`, item]));

  let createdPackages = 0;
  for (const [orden, [nombre, clases, ...prices]] of PRICE_TABLE.entries()) {
    for (const [column, price] of prices.entries()) {
      if (price === null) continue;
      const disciplineId = idByName.get(columns[column].toLocaleLowerCase("es"))!;
      const current = packageByKey.get(`${disciplineId}|${nombre.toLocaleLowerCase("es")}`);
      if (current) {
        if (options.ajustarPrecios && (Number(current.precio) !== price || current.clases !== clases)) {
          log(`  ~ ${columns[column]} · ${nombre}: $${Number(current.precio).toLocaleString("es-CO")} → $${price.toLocaleString("es-CO")} (${clases} clase(s))`);
          if (options.apply) await db.package.update({ where: { id: current.id }, data: { precio: price, clases } });
        }
        continue;
      }

      log(`  + ${columns[column]} · ${nombre} · ${clases} clase(s) · $${price.toLocaleString("es-CO")}`);
      createdPackages += 1;
      if (options.apply) {
        await db.package.create({ data: { clientId, disciplineId, nombre, clases, precio: price, orden } });
      }
    }
  }
  log(`  ${createdPackages} paquete(s) nuevos`);
  return idByName;
}
