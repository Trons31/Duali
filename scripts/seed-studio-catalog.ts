/**
 * Carga el catalogo del estudio (spec 004 R5) para un cliente existente.
 * Los precios estan en scripts/studio-catalog-data.ts.
 *
 *   npx tsx scripts/seed-studio-catalog.ts --email dueno@estudio.com            # solo muestra el plan
 *   npx tsx scripts/seed-studio-catalog.ts --email dueno@estudio.com --apply    # escribe
 *   ... --apply --activar-modulo                                                # ademas activa el modulo Estudio
 *
 * Es aditivo e idempotente: crea lo que falta y nunca modifica ni borra lo que ya
 * existe (una disciplina o paquete con el mismo nombre se respeta tal cual).
 */
import { PrismaClient } from "@prisma/client";
import { ensureStudioCatalog } from "./studio-catalog-data";

const prisma = new PrismaClient();

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const email = arg("--email")?.toLowerCase();
  const apply = process.argv.includes("--apply");
  const activateModule = process.argv.includes("--activar-modulo");
  if (!email) throw new Error("Falta --email <correo del cliente>");

  const client = await prisma.client.findFirst({ where: { email, deletedAt: null }, select: { id: true, businessName: true } });
  if (!client) throw new Error(`No existe un cliente activo con el correo ${email}`);

  console.log(`${apply ? "APLICANDO" : "SIMULACION (usa --apply para escribir)"} · ${client.businessName}`);

  await ensureStudioCatalog(prisma, client.id, { apply });

  if (activateModule) {
    console.log("  + activar modulo Estudio (Academia se mantiene como esta)");
    if (apply) await prisma.client.update({ where: { id: client.id }, data: { moduloEstudio: true } });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
