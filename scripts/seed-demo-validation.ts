/**
 * Escenarios de validación (spec 029) sobre el usuario demo que ya existe
 * (demo@gmail.com; otro con --email). Nunca crea usuarios.
 *
 *   npx tsx scripts/seed-demo-validation.ts            # solo muestra el plan
 *   npx tsx scripts/seed-demo-validation.ts --apply    # escribe
 *
 * Escribe en la base de DATABASE_URL: revisa a cual apunta antes de usar --apply.
 * Necesita el estudio demo (npm run db:seed:demo -- --apply) y las migraciones al dia.
 */
import { prisma } from "@/lib/prisma";
import { seedDemoValidation } from "./demo-validation";

const emailIndex = process.argv.indexOf("--email");

seedDemoValidation({ apply: process.argv.includes("--apply"), email: emailIndex === -1 ? undefined : process.argv[emailIndex + 1] })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
