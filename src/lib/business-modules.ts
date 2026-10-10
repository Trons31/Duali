import { prisma } from "@/lib/prisma";
import type { BusinessModules } from "@/lib/web-types";

const LEGACY_MODULES: BusinessModules = { moduloAcademia: true, moduloEstudio: false };

/**
 * Modulos activos del negocio (spec 002). Lo usa el layout de todo el dashboard,
 * asi que si la migracion de las columnas aun no se aplico en la base se cae a
 * lo de siempre (solo Academia) en vez de tumbar todas las paginas.
 */
export async function getBusinessModules(clientId: string): Promise<BusinessModules> {
  // Sin sesion el layout redirige al login, pero la pagina se renderiza en
  // paralelo y llega aqui con el id vacio: no hace falta consultar.
  if (!clientId) return LEGACY_MODULES;
  try {
    return await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { moduloAcademia: true, moduloEstudio: true }
    });
  } catch (error) {
    console.error("No se pudieron leer los modulos del negocio; se usa Academia", error);
    return LEGACY_MODULES;
  }
}
