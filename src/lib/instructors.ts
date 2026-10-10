import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/http";
import { describePay, type InstructorPay } from "@/lib/instructor-pay";
import { prisma } from "@/lib/prisma";
import type { ExtendedTransactionClient } from "@/lib/prisma-types";
import type { InstructorInput } from "@/lib/validations";

// Instructores del estudio (spec 023, fase 1): registro, disciplinas que dan,
// titular de los horarios y reemplazos.

export const instructorInclude = {
  disciplines: {
    include: { discipline: { select: { id: true, nombre: true, color: true, tipo: true, deletedAt: true } } },
    orderBy: { discipline: { nombre: "asc" } }
  },
  _count: { select: { schedules: { where: { deletedAt: null } } } }
} satisfies Prisma.InstructorInclude;

type InstructorRow = Prisma.InstructorGetPayload<{ include: typeof instructorInclude }>;

export function instructorName(row: { nombre: string; apellido: string | null }) {
  return row.apellido ? `${row.nombre} ${row.apellido}` : row.nombre;
}

const num = (value: Prisma.Decimal | null) => (value == null ? null : Number(value));

type PayFields = Pick<InstructorRow, "sueldo" | "variable" | "valor" | "minimoPorClase" | "alumnosMinimos"> & {
  disciplines: Array<{ disciplineId: string; valor: Prisma.Decimal | null }>;
};

export function instructorPay(row: PayFields): InstructorPay {
  return {
    sueldo: num(row.sueldo),
    variable: row.variable,
    valor: num(row.valor),
    minimoPorClase: num(row.minimoPorClase),
    alumnosMinimos: row.alumnosMinimos,
    valoresDisciplina: Object.fromEntries(row.disciplines.map((item) => [item.disciplineId, num(item.valor)]))
  };
}

export function serializeInstructor(row: InstructorRow) {
  const pay = instructorPay(row);
  const configured = pay.sueldo != null || Boolean(pay.variable);
  return {
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    nombreCompleto: instructorName(row),
    celular: row.celular,
    email: row.email,
    color: row.color,
    activo: row.activo,
    notas: row.notas,
    pago: pay,
    // Los importados del horario llegan sin forma de pago (R3).
    pagoConfigurado: configured,
    descripcionPago: configured ? describePay(pay) : "Falta definir cómo se le paga",
    disciplinas: row.disciplines
      .filter((item) => !item.discipline.deletedAt)
      .map((item) => ({
        id: item.discipline.id,
        nombre: item.discipline.nombre,
        color: item.discipline.color,
        tipo: item.discipline.tipo,
        valor: num(item.valor)
      })),
    horarios: row._count.schedules,
    createdAt: row.createdAt.toISOString()
  };
}

export type InstructorView = ReturnType<typeof serializeInstructor>;

export async function listInstructors(clientId: string) {
  const rows = await prisma.instructor.findMany({
    where: { clientId, deletedAt: null },
    include: instructorInclude,
    orderBy: [{ activo: "desc" }, { nombre: "asc" }]
  });
  return rows.map(serializeInstructor);
}

export async function getInstructor(clientId: string, id: string) {
  const row = await prisma.instructor.findFirst({ where: { id, clientId, deletedAt: null }, include: instructorInclude });
  if (!row) throw new ApiError(404, "Instructor no encontrado");
  return serializeInstructor(row);
}

async function assertOwnDisciplines(clientId: string, ids: string[]) {
  if (!ids.length) return;
  const found = await prisma.discipline.count({ where: { id: { in: ids }, clientId, deletedAt: null } });
  if (found !== new Set(ids).size) throw new ApiError(422, "Alguna disciplina no existe");
}

/** El nombre del titular se copia al texto del horario: lo usan la pagina publica y lo viejo. */
async function syncScheduleNames(tx: ExtendedTransactionClient, instructorId: string, name: string) {
  await tx.classSchedule.updateMany({ where: { instructorId }, data: { instructor: name } });
}

function payData(input: InstructorInput) {
  return {
    sueldo: input.sueldo,
    variable: input.variable,
    valor: input.variable ? input.valor : null,
    minimoPorClase: input.variable && input.variable !== "POR_CLASE" ? input.minimoPorClase : null,
    alumnosMinimos: input.variable ? input.alumnosMinimos : 1
  };
}

/** R1: crea o actualiza, con sus disciplinas, en una transaccion. */
export async function saveInstructor(clientId: string, input: InstructorInput, id?: string) {
  await assertOwnDisciplines(clientId, input.disciplinas.map((item) => item.disciplineId));
  if (id) {
    const current = await prisma.instructor.findFirst({ where: { id, clientId, deletedAt: null }, select: { id: true } });
    if (!current) throw new ApiError(404, "Instructor no encontrado");
  }

  const data = {
    nombre: input.nombre,
    apellido: input.apellido ?? null,
    celular: input.celular,
    email: input.email ?? null,
    color: input.color,
    notas: input.notas ?? null,
    ...(input.activo !== undefined ? { activo: input.activo } : {}),
    ...payData(input)
  };
  const disciplines = input.disciplinas.map((item) => ({
    disciplineId: item.disciplineId,
    // El valor propio solo tiene sentido con una variable.
    valor: input.variable ? (item.valor ?? null) : null
  }));

  const saved = await prisma.$transaction(async (tx) => {
    const row = id
      ? await tx.instructor.update({ where: { id }, data })
      : await tx.instructor.create({ data: { ...data, clientId } });
    await tx.instructorDiscipline.deleteMany({ where: { instructorId: row.id } });
    if (disciplines.length) await tx.instructorDiscipline.createMany({ data: disciplines.map((item) => ({ ...item, instructorId: row.id })) });
    await syncScheduleNames(tx, row.id, instructorName(row));
    return row;
  });
  return getInstructor(clientId, saved.id);
}

/**
 * R1: si ya dicto o tiene horarios, se desactiva (su historia y sus pagos se
 * conservan); si no, se borra.
 */
export async function removeInstructor(clientId: string, id: string) {
  const row = await prisma.instructor.findFirst({
    where: { id, clientId, deletedAt: null },
    select: { id: true, _count: { select: { schedules: true, reemplazos: true, cycles: true } } }
  });
  if (!row) throw new ApiError(404, "Instructor no encontrado");
  if (row._count.schedules || row._count.reemplazos || row._count.cycles) {
    await prisma.instructor.update({ where: { id }, data: { activo: false } });
    return { resultado: "DESACTIVADO" as const };
  }
  await prisma.instructor.update({ where: { id }, data: { deletedAt: new Date(), activo: false } });
  return { resultado: "ELIMINADO" as const };
}

/** D5: a quien se le puede asignar una clase: del negocio, no borrado y activo. */
export async function assertAssignableInstructor(clientId: string, id: string, tx: ExtendedTransactionClient = prisma) {
  const row = await tx.instructor.findFirst({ where: { id, clientId, deletedAt: null }, select: { nombre: true, apellido: true, activo: true } });
  if (!row) throw new ApiError(422, "Ese instructor no existe");
  if (!row.activo) throw new ApiError(422, "Ese instructor está inactivo");
  return instructorName(row);
}

/**
 * D5: lo que se guarda en el horario al elegir titular. Con un instructor se
 * copia su nombre al texto; "sin asignar" (null) borra los dos.
 */
export async function scheduleInstructorData(clientId: string, body: { instructorId?: string | null; instructor?: string | null }) {
  if (body.instructorId === undefined) return {};
  if (body.instructorId === null) return { instructorId: null, instructor: body.instructor ?? null };
  return { instructorId: body.instructorId, instructor: await assertAssignableInstructor(clientId, body.instructorId) };
}

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("es");

/** R3: los nombres escritos a mano en el horario que no son de un instructor registrado. */
export async function unregisteredScheduleNames(clientId: string) {
  const [schedules, instructors] = await Promise.all([
    prisma.classSchedule.findMany({
      where: { clientId, deletedAt: null, instructorId: null, instructor: { not: null } },
      select: { instructor: true }
    }),
    prisma.instructor.findMany({ where: { clientId, deletedAt: null }, select: { nombre: true, apellido: true } })
  ]);
  const known = new Set(instructors.map((row) => normalize(instructorName(row))));
  const names = new Map<string, string>();
  for (const schedule of schedules) {
    const text = schedule.instructor?.trim();
    if (text && !known.has(normalize(text)) && !names.has(normalize(text))) names.set(normalize(text), text);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * R3: registra los instructores escritos a mano y los deja como titulares de
 * sus horarios, con las disciplinas que ya dan. Llegan sin forma de pago.
 */
export async function importScheduleInstructors(clientId: string) {
  const schedules = await prisma.classSchedule.findMany({
    where: { clientId, deletedAt: null, instructorId: null, instructor: { not: null } },
    select: { id: true, instructor: true, disciplineId: true }
  });
  const existing = await prisma.instructor.findMany({ where: { clientId, deletedAt: null }, select: { id: true, nombre: true, apellido: true } });
  const byName = new Map(existing.map((row) => [normalize(instructorName(row)), row.id]));
  const groups = new Map<string, { text: string; scheduleIds: string[]; disciplineIds: Set<string> }>();
  for (const schedule of schedules) {
    const text = schedule.instructor!.trim();
    if (!text) continue;
    const group = groups.get(normalize(text)) ?? { text, scheduleIds: [], disciplineIds: new Set<string>() };
    group.scheduleIds.push(schedule.id);
    group.disciplineIds.add(schedule.disciplineId);
    groups.set(normalize(text), group);
  }

  let creados = 0;
  await prisma.$transaction(async (tx) => {
    for (const [key, group] of groups) {
      let instructorId = byName.get(key);
      if (!instructorId) {
        const [nombre, ...rest] = group.text.split(/\s+/);
        const row = await tx.instructor.create({ data: { clientId, nombre, apellido: rest.join(" ") || null } });
        instructorId = row.id;
        creados += 1;
      }
      await tx.instructorDiscipline.createMany({
        data: [...group.disciplineIds].map((disciplineId) => ({ instructorId: instructorId!, disciplineId })),
        skipDuplicates: true
      });
      await tx.classSchedule.updateMany({ where: { id: { in: group.scheduleIds }, instructorId: null }, data: { instructorId } });
    }
  });
  return { creados, enlazados: groups.size };
}
