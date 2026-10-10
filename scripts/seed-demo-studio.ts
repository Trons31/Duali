/**
 * Estudio demo (spec 016) sobre el usuario demo que ya existe (demo@gmail.com;
 * otro con --email). Nunca crea usuarios.
 *
 *   npx tsx scripts/seed-demo-studio.ts            # solo muestra el plan
 *   npx tsx scripts/seed-demo-studio.ts --apply    # escribe
 *   ... --email otro@correo.com                    # otro usuario existente
 *
 * Escribe en la base de DATABASE_URL: revisa a cual apunta antes de usar --apply.
 * Es aditivo e idempotente (ver scripts/demo-studio.ts).
 */
import { prisma } from "@/lib/prisma";
import { seedDemoStudio } from "./demo-studio";

const emailIndex = process.argv.indexOf("--email");

seedDemoStudio({ apply: process.argv.includes("--apply"), email: emailIndex === -1 ? undefined : process.argv[emailIndex + 1] })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
