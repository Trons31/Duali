import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

// Helpers del Modo Estudio (specs 003 y 004).

export const disciplineInclude = {
  comboItems: {
    where: { discipline: { deletedAt: null } },
    select: { discipline: { select: { id: true, nombre: true, color: true } } }
  }
} satisfies Prisma.DisciplineInclude;

type DisciplineWithItems = Prisma.DisciplineGetPayload<{ include: typeof disciplineInclude }>;

export function serializeDiscipline({ comboItems, clientId: _clientId, deletedAt: _deletedAt, ...discipline }: DisciplineWithItems) {
  return { ...discipline, incluye: comboItems.map((item) => item.discipline) };
}

export async function assertUniqueDisciplineName(clientId: string, nombre: string, exceptId?: string) {
  const duplicate = await prisma.discipline.findFirst({
    where: {
      clientId,
      deletedAt: null,
      nombre: { equals: nombre, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {})
    },
    select: { id: true }
  });

  if (duplicate) throw new ApiError(409, `Ya existe una disciplina llamada "${nombre}"`);
}

/** Valida que los ids sean clases propias y activas; un combo necesita al menos 2. */
export async function resolveComboItems(clientId: string, ids: string[] | undefined) {
  const uniqueIds = [...new Set(ids ?? [])];

  if (uniqueIds.length < 2) {
    throw new ApiError(422, "Un combo debe incluir al menos 2 disciplinas");
  }

  const found = await prisma.discipline.count({
    where: { id: { in: uniqueIds }, clientId, tipo: "CLASE", deletedAt: null }
  });

  if (found !== uniqueIds.length) {
    throw new ApiError(422, "Un combo solo puede incluir disciplinas (no otros combos) de tu negocio");
  }

  return uniqueIds;
}

/** Spec 003 R3: no se borra lo que esta en uso en paquetes o combos activos. */
export async function assertDisciplineCanBeDeleted(clientId: string, disciplineId: string) {
  const [packageCount, scheduleCount, combos] = await Promise.all([
    prisma.package.count({ where: { clientId, disciplineId, deletedAt: null } }),
    prisma.classSchedule.count({ where: { clientId, disciplineId, deletedAt: null } }),
    prisma.disciplineComboItem.findMany({
      where: { disciplineId, combo: { deletedAt: null } },
      select: { combo: { select: { nombre: true } } }
    })
  ]);

  if (packageCount > 0) {
    throw new ApiError(
      409,
      `Tiene ${packageCount} paquete${packageCount === 1 ? "" : "s"}. Elimínalos o desactiva la disciplina.`
    );
  }

  if (scheduleCount > 0) {
    throw new ApiError(
      409,
      `Tiene ${scheduleCount} horario${scheduleCount === 1 ? "" : "s"} de clase. Elimínalos o desactiva la disciplina.`
    );
  }

  if (combos.length > 0) {
    const names = combos.map((item) => item.combo.nombre).join(", ");
    throw new ApiError(409, `Está incluida en el combo ${names}. Quítala del combo primero.`);
  }
}

export async function assertUniquePackageName(
  clientId: string,
  disciplineIds: string[],
  nombre: string,
  exceptId?: string
) {
  const duplicate = await prisma.package.findFirst({
    where: {
      clientId,
      deletedAt: null,
      disciplineId: { in: disciplineIds },
      nombre: { equals: nombre, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {})
    },
    select: { discipline: { select: { nombre: true } } }
  });

  if (duplicate) {
    throw new ApiError(409, `${duplicate.discipline.nombre} ya tiene un paquete "${nombre}"`);
  }
}
