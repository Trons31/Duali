import { Prisma } from "@prisma/client";
import { listClassSessions, sessionKey, type ClassSessionView } from "@/lib/class-sessions";
import {
  cycleContaining,
  cycleLabel,
  cyclesBetween,
  frequencyLabel,
  type PayFrequency
} from "@/lib/instructor-cycle-time";
import { attendanceValue, classEarning, describePay, type InstructorPay } from "@/lib/instructor-pay";
import { instructorName, instructorPay } from "@/lib/instructors";
import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { ExtendedTransactionClient } from "@/lib/prisma-types";
import { addDaysToKey, dateKeyToDate, dateToDateKey, studioNow, timeKeyToMinutes } from "@/lib/studio-time";
import type { InstructorPaySettingsInput } from "@/lib/validations";

// Ciclos de pago de instructores (spec 023 fase 2, D6 y D7), como
// lib/barber-payment-ledger.ts de CliqCut: se materializan al consultar, sin
// cron, y mientras un ciclo no tenga pagos se recalcula con lo ultimo.

type CycleType = "COMISION" | "SUELDO";

/** Cuantos dias hacia atras se recalculan los ciclos sin pagos (asistencia marcada tarde). */
const RECALC_DAYS = 62;

const num = (value: Prisma.Decimal | number | null | undefined) => (value == null ? 0 : Number(value));

function calendar(settings: SettingsRow, tipo: CycleType) {
  return tipo === "COMISION"
    ? { frecuencia: settings.frecuencia, diaPago: settings.diaPago, diaPagoAbreSiguiente: settings.diaPagoAbreSiguiente }
    : { frecuencia: settings.frecuenciaSueldo, diaPago: settings.diaPagoSueldo, diaPagoAbreSiguiente: settings.diaPagoAbreSiguiente };
}

type SettingsRow = Prisma.InstructorPaymentSettingsGetPayload<object>;

export function serializePaySettings(row: SettingsRow) {
  return {
    frecuencia: row.frecuencia,
    diaPago: row.diaPago,
    frecuenciaSueldo: row.frecuenciaSueldo,
    diaPagoSueldo: row.diaPagoSueldo,
    diaPagoAbreSiguiente: row.diaPagoAbreSiguiente,
    inasistenciasCuentan: row.inasistenciasCuentan,
    pagarClasesVacias: row.pagarClasesVacias,
    basePorcentaje: row.basePorcentaje,
    activadoEl: dateToDateKey(row.activadoEl)
  };
}

export type InstructorPaySettingsView = ReturnType<typeof serializePaySettings>;

/**
 * Que formas de pago usa el equipo activo: decide si se puede configurar el ciclo
 * y que calendarios y reglas se muestran (sin sueldos no aparece el de sueldos).
 */
export async function getTeamPaySummary(clientId: string) {
  const rows = await prisma.instructor.findMany({
    where: { clientId, deletedAt: null, activo: true, OR: [{ sueldo: { not: null } }, { variable: { not: null } }] },
    select: { sueldo: true, variable: true }
  });
  return {
    instructores: rows.length,
    comision: rows.some((row) => row.variable),
    sueldo: rows.some((row) => row.sueldo != null),
    porClase: rows.some((row) => row.variable === "POR_CLASE"),
    porAlumno: rows.some((row) => row.variable === "ALUMNO_FIJO" || row.variable === "ALUMNO_PORCENTAJE"),
    porcentaje: rows.some((row) => row.variable === "ALUMNO_PORCENTAJE")
  };
}

export type TeamPaySummary = Awaited<ReturnType<typeof getTeamPaySummary>>;

export async function getPaySettings(clientId: string) {
  const row = await prisma.instructorPaymentSettings.findUnique({ where: { clientId } });
  return row ? serializePaySettings(row) : null;
}

/**
 * R6. La primera vez activa los ciclos desde hoy (D6: sin deuda de antes). Si
 * cambia el calendario, los ciclos sin pagos que aun no terminan se borran y se
 * vuelven a armar con el calendario nuevo desde donde termino el ultimo.
 */
export async function savePaySettings(clientId: string, input: InstructorPaySettingsInput, now = new Date()) {
  const today = studioNow(now).dateKey;
  const current = await prisma.instructorPaymentSettings.findUnique({ where: { clientId } });
  // Sin instructores con forma de pago no hay a quien pagarle todavia.
  if (!current && !(await getTeamPaySummary(clientId)).instructores) {
    throw new ApiError(409, "Primero registra a tus instructores con su forma de pago");
  }
  const calendarChanged =
    current &&
    (current.frecuencia !== input.frecuencia ||
      current.diaPago !== input.diaPago ||
      current.frecuenciaSueldo !== input.frecuenciaSueldo ||
      current.diaPagoSueldo !== input.diaPagoSueldo ||
      current.diaPagoAbreSiguiente !== input.diaPagoAbreSiguiente);

  await prisma.$transaction(async (tx) => {
    await tx.instructorPaymentSettings.upsert({
      where: { clientId },
      create: { ...input, clientId, activadoEl: dateKeyToDate(today) },
      update: input
    });
    if (calendarChanged) {
      await tx.instructorCycle.deleteMany({ where: { clientId, pagado: 0, fin: { gte: dateKeyToDate(today) } } });
    }
  });
  await ensureInstructorLedger(clientId, now);
  return getPaySettings(clientId);
}

/** D3: la clase ya termino (no cuenta lo que aun no se dicta). */
function hasEnded(session: ClassSessionView, today: string, minutes: number) {
  if (session.fecha !== today) return session.fecha < today;
  return timeKeyToMinutes(session.horaFin) <= minutes;
}

type BookingRow = {
  id: string;
  sessionId: string;
  estado: string;
  memberPackage: { precio: Prisma.Decimal; clases: number; pagado: Prisma.Decimal; anuladoAt: Date | null };
};

/** D2: lo que aporta una asistencia; con "solo lo cobrado", en proporcion a lo pagado. */
function bookingValue(booking: BookingRow, base: "VENDIDO" | "COBRADO") {
  const sale = booking.memberPackage;
  if (sale.anuladoAt) return { valor: 0, acreditado: 0 };
  const valor = attendanceValue({ precio: num(sale.precio), clases: sale.clases });
  if (base === "VENDIDO") return { valor, acreditado: valor };
  const ratio = num(sale.precio) > 0 ? Math.min(1, num(sale.pagado) / num(sale.precio)) : 0;
  return { valor, acreditado: valor * ratio };
}

function paySnapshot(pay: InstructorPay) {
  return {
    sueldoSnapshot: pay.sueldo,
    variableSnapshot: pay.variable,
    valorSnapshot: pay.valor,
    minimoSnapshot: pay.minimoPorClase,
    alumnosMinimosSnapshot: pay.alumnosMinimos,
    valoresDisciplinaSnapshot: (pay.valoresDisciplina ?? {}) as Prisma.InputJsonValue
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function settlement(pagado: number, pendiente: number) {
  if (pagado <= 0) return "SIN_PAGAR" as const;
  return pendiente > 0.5 ? ("PARCIAL" as const) : ("PAGADO" as const);
}

/** D7: la forma de pago congelada en el ciclo. */
export function snapshotPay(cycle: Prisma.InstructorCycleGetPayload<object>): InstructorPay {
  return {
    sueldo: cycle.sueldoSnapshot == null ? null : num(cycle.sueldoSnapshot),
    variable: cycle.variableSnapshot,
    valor: cycle.valorSnapshot == null ? null : num(cycle.valorSnapshot),
    minimoPorClase: cycle.minimoSnapshot == null ? null : num(cycle.minimoSnapshot),
    alumnosMinimos: cycle.alumnosMinimosSnapshot,
    valoresDisciplina: (cycle.valoresDisciplinaSnapshot ?? {}) as Record<string, number | null>
  };
}

/**
 * R7: crea los ciclos que falten hasta hoy y recalcula los que no tienen pagos.
 * Idempotente; todo el negocio en una transaccion con candado para que dos
 * consultas a la vez no choquen.
 */
export async function ensureInstructorLedger(clientId: string, now = new Date()) {
  const settings = await prisma.instructorPaymentSettings.findUnique({ where: { clientId } });
  if (!settings) return false;
  const { dateKey: today, minutes } = studioNow(now);
  const activation = dateToDateKey(settings.activadoEl);
  if (activation > today) return true;

  const instructors = await prisma.instructor.findMany({
    where: { clientId, deletedAt: null },
    include: { disciplines: true }
  });

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`instructor-ledger:${clientId}`}))`;

      for (const instructor of instructors) {
        const pay = instructorPay(instructor);
        const types: CycleType[] = [];
        if (pay.variable) types.push("COMISION");
        if (pay.sueldo != null) types.push("SUELDO");

        // Si cambio la forma de pago, los ciclos sin pagos del calendario que ya no aplica se van.
        const dropped = (["COMISION", "SUELDO"] as const).filter((tipo) => !types.includes(tipo));
        if (dropped.length) {
          await tx.instructorCycle.deleteMany({
            where: { instructorId: instructor.id, tipo: { in: dropped }, pagado: 0, fin: { gte: dateKeyToDate(today) } }
          });
        }
        if (!instructor.activo) continue;

        for (const tipo of types) {
          const last = await tx.instructorCycle.findFirst({
            where: { instructorId: instructor.id, tipo },
            orderBy: { fin: "desc" },
            select: { fin: true }
          });
          const createdKey = studioNow(instructor.createdAt).dateKey;
          const start = last ? addDaysToKey(dateToDateKey(last.fin), 1) : createdKey > activation ? createdKey : activation;
          const windows = cyclesBetween(start, today, calendar(settings, tipo));
          if (!windows.length) continue;
          await tx.instructorCycle.createMany({
            data: windows.map((window) => ({
              clientId,
              instructorId: instructor.id,
              tipo,
              inicio: dateKeyToDate(window.inicio),
              fin: dateKeyToDate(window.fin),
              venceEl: dateKeyToDate(window.venceEl),
              ...paySnapshot(pay)
            })),
            skipDuplicates: true
          });
        }
      }

      await recalculate(tx, clientId, settings, instructors, today, minutes);
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  return true;
}

async function recalculate(
  tx: ExtendedTransactionClient,
  clientId: string,
  settings: SettingsRow,
  instructors: Array<Parameters<typeof instructorPay>[0] & { id: string }>,
  today: string,
  minutes: number
) {
  const todayDate = dateKeyToDate(today);
  await tx.instructorCycle.updateMany({ where: { clientId, fin: { lt: todayDate }, estado: "ABIERTO" }, data: { estado: "CERRADO" } });

  // Los ciclos con pagos tambien se revisan, pero solo para sumar clases dictadas
  // despues del pago: lo que ya tenian no se toca (D7).
  const cycles = await tx.instructorCycle.findMany({
    where: { clientId, fin: { gte: dateKeyToDate(addDaysToKey(today, -RECALC_DAYS)) } },
    include: { classes: { select: { ganado: true, alumnos: true } } },
    orderBy: { inicio: "asc" }
  });
  if (!cycles.length) return;
  const openIds = cycles.filter((cycle) => num(cycle.pagado) === 0).map((cycle) => cycle.id);
  await tx.instructorCycleClass.deleteMany({ where: { cycleId: { in: openIds } } });
  await tx.instructorCycleCollection.deleteMany({ where: { cycleId: { in: openIds } } });

  const from = cycles.reduce((min, cycle) => (dateToDateKey(cycle.inicio) < min ? dateToDateKey(cycle.inicio) : min), today);
  const to = cycles.reduce((max, cycle) => (dateToDateKey(cycle.fin) > max ? dateToDateKey(cycle.fin) : max), from);
  const lastDay = to < today ? to : today;

  const [sessions, frozenRows] = await Promise.all([
    listClassSessions(clientId, from, lastDay),
    // Una clase ya incluida en un ciclo pagado no se vuelve a pagar.
    tx.instructorCycleClass.findMany({
      where: { cycle: { clientId }, fecha: { gte: dateKeyToDate(from), lte: dateKeyToDate(lastDay) } },
      select: { scheduleId: true, fecha: true }
    })
  ]);
  const frozen = new Set(frozenRows.map((row) => sessionKey(row.scheduleId, dateToDateKey(row.fecha))));
  const dictated = sessions.filter(
    (session) => !session.cancelada && session.instructorId && hasEnded(session, today, minutes) && !frozen.has(session.key)
  );

  const storedIds = dictated.flatMap((session) => (session.sessionId ? [session.sessionId] : []));
  const bookings: BookingRow[] = storedIds.length
    ? await tx.booking.findMany({
        where: { sessionId: { in: storedIds }, estado: { not: "CANCELADA" } },
        select: {
          id: true,
          sessionId: true,
          estado: true,
          memberPackage: { select: { precio: true, clases: true, pagado: true, anuladoAt: true } }
        }
      })
    : [];
  const bookingsBySession = new Map<string, BookingRow[]>();
  for (const booking of bookings) bookingsBySession.set(booking.sessionId, [...(bookingsBySession.get(booking.sessionId) ?? []), booking]);

  const byId = new Map(instructors.map((instructor) => [instructor.id, instructor]));
  const counted = new Set(settings.inasistenciasCuentan ? ["ASISTIO", "NO_ASISTIO"] : ["ASISTIO"]);

  for (const cycle of cycles) {
    const instructor = byId.get(cycle.instructorId);
    const inicio = dateToDateKey(cycle.inicio);
    const fin = dateToDateKey(cycle.fin);
    const frozenCycle = num(cycle.pagado) > 0;
    // Sin pagos, el ciclo usa la forma de pago de hoy (D7: "aplica a este ciclo");
    // con pagos, la que quedo congelada.
    const pay = frozenCycle ? snapshotPay(cycle) : instructor ? instructorPay(instructor) : null;
    const mine = dictated.filter((session) => session.instructorId === cycle.instructorId && session.fecha >= inicio && session.fecha <= fin);

    const rows: Prisma.InstructorCycleClassCreateManyInput[] = [];
    const collections: Prisma.InstructorCycleCollectionCreateManyInput[] = [];
    // En un ciclo con pagos se parte de las clases que ya tenia.
    const kept = frozenCycle ? cycle.classes : [];
    let alumnos = kept.reduce((sum, row) => sum + row.alumnos, 0);
    let sinMarcar = 0;

    if (cycle.tipo === "COMISION" && pay?.variable) {
      for (const session of mine) {
        const list = session.sessionId ? (bookingsBySession.get(session.sessionId) ?? []) : [];
        const present = list.filter((booking) => counted.has(booking.estado));
        const unmarked = list.filter((booking) => booking.estado === "RESERVADA").length;
        const values = present.map((booking) => ({ booking, ...bookingValue(booking, settings.basePorcentaje) }));
        const valorClases = values.reduce((sum, item) => sum + item.acreditado, 0);
        const earning = classEarning(pay, {
          disciplineId: session.discipline.id,
          alumnos: present.length,
          valorClases,
          pagarClasesVacias: settings.pagarClasesVacias
        });
        sinMarcar += unmarked;
        // Una clase vacia que no gana nada no se lista.
        if (!present.length && !unmarked && !earning.ganado) continue;
        alumnos += present.length;
        rows.push({
          cycleId: cycle.id,
          scheduleId: session.scheduleId,
          fecha: dateKeyToDate(session.fecha),
          sessionId: session.sessionId,
          horaInicio: session.horaInicio,
          disciplineId: session.discipline.id,
          disciplina: session.discipline.nombre,
          alumnos: present.length,
          inasistencias: list.filter((booking) => booking.estado === "NO_ASISTIO").length,
          sinMarcar: unmarked,
          valorClases: round2(valorClases),
          variableAplicada: pay.variable,
          valorAplicado: earning.valorAplicado,
          regla: earning.regla,
          ganado: earning.ganado
        });
        if (pay.variable === "ALUMNO_PORCENTAJE" && settings.basePorcentaje === "COBRADO") {
          for (const item of values) {
            collections.push({ cycleId: cycle.id, bookingId: item.booking.id, valor: round2(item.valor), acreditado: round2(item.acreditado) });
          }
        }
      }
    } else if (cycle.tipo === "SUELDO") {
      // Informativo: las clases que dicto en el ciclo de sueldos.
      sinMarcar = mine.reduce(
        (sum, session) => sum + (session.sessionId ? (bookingsBySession.get(session.sessionId) ?? []).filter((booking) => booking.estado === "RESERVADA").length : 0),
        0
      );
    }

    // D2: lo cobrado despues de clases de ciclos ya pagados entra al ciclo abierto.
    let cobradoDespues = 0;
    const isOpen = inicio <= today && today <= fin;
    if (isOpen && !frozenCycle && cycle.tipo === "COMISION" && pay?.variable === "ALUMNO_PORCENTAJE" && settings.basePorcentaje === "COBRADO") {
      const late = await lateCollections(tx, cycle.instructorId, cycle.id);
      for (const item of late) {
        cobradoDespues += item.ganado;
        collections.push({ cycleId: cycle.id, bookingId: item.bookingId, valor: item.valor, acreditado: item.delta, tardio: true });
      }
    }

    if (rows.length) await tx.instructorCycleClass.createMany({ data: rows, skipDuplicates: true });
    if (collections.length) await tx.instructorCycleCollection.createMany({ data: collections, skipDuplicates: true });

    const generado = [...kept, ...rows].reduce((sum, row) => sum + Number(row.ganado), 0);
    const sueldo = cycle.tipo === "SUELDO" ? (frozenCycle ? num(cycle.sueldo) : (pay?.sueldo ?? 0)) : 0;
    const cobrado = frozenCycle ? num(cycle.cobradoDespues) : round2(cobradoDespues);
    const neto = round2(generado + cobrado + sueldo + num(cycle.ajustes) - num(cycle.adelantos));
    const pendiente = round2(neto - num(cycle.pagado));
    await tx.instructorCycle.update({
      where: { id: cycle.id },
      data: {
        ...(pay && !frozenCycle ? paySnapshot(pay) : {}),
        estado: fin < today ? "CERRADO" : "ABIERTO",
        situacion: settlement(num(cycle.pagado), pendiente),
        clases: cycle.tipo === "SUELDO" ? mine.length : kept.length + rows.length,
        alumnos,
        sinMarcar,
        generado,
        cobradoDespues: cobrado,
        sueldo,
        neto,
        pendiente,
        calculadoAt: new Date()
      }
    });
  }
}

/**
 * D2: asistencias de ciclos ya pagados cuyo plan se pago despues. La diferencia
 * entre lo que vale hoy y lo ya acreditado se gana con el % congelado de esa clase.
 */
async function lateCollections(tx: ExtendedTransactionClient, instructorId: string, openCycleId: string) {
  const credited = await tx.instructorCycleCollection.findMany({
    where: { cycle: { instructorId, pagado: { gt: 0 } }, NOT: { cycleId: openCycleId } },
    select: { bookingId: true, valor: true, acreditado: true, tardio: true }
  });
  if (!credited.length) return [];
  const totals = new Map<string, { valor: number; acreditado: number }>();
  for (const row of credited) {
    const total = totals.get(row.bookingId) ?? { valor: num(row.valor), acreditado: 0 };
    total.acreditado += num(row.acreditado);
    totals.set(row.bookingId, total);
  }
  const bookings = await tx.booking.findMany({
    where: { id: { in: [...totals.keys()] } },
    select: {
      id: true,
      sessionId: true,
      estado: true,
      session: { select: { scheduleId: true, fecha: true } },
      memberPackage: { select: { precio: true, clases: true, pagado: true, anuladoAt: true } }
    }
  });
  const classRows = await tx.instructorCycleClass.findMany({
    where: {
      OR: bookings.map((booking) => ({ scheduleId: booking.session.scheduleId, fecha: booking.session.fecha }))
    },
    select: { scheduleId: true, fecha: true, valorAplicado: true }
  });
  const pct = new Map(classRows.map((row) => [sessionKey(row.scheduleId, dateToDateKey(row.fecha)), num(row.valorAplicado)]));

  return bookings.flatMap((booking) => {
    const total = totals.get(booking.id)!;
    const now = bookingValue(booking, "COBRADO").acreditado;
    const delta = round2(now - total.acreditado);
    const percent = pct.get(sessionKey(booking.session.scheduleId, dateToDateKey(booking.session.fecha))) ?? 0;
    if (delta <= 0.5 || !percent) return [];
    return [{ bookingId: booking.id, valor: total.valor, delta, ganado: Math.round((delta * percent) / 100) }];
  });
}

// ─── Vista para la pagina de Pagos ────────────────────────────────────────────

const MONEY = (value: Prisma.Decimal | number) => Math.round(num(value));

export function serializeCycleView(cycle: Prisma.InstructorCycleGetPayload<{ include: { classes: true } }>, today: string) {
  const inicio = dateToDateKey(cycle.inicio);
  const fin = dateToDateKey(cycle.fin);
  return {
    id: cycle.id,
    tipo: cycle.tipo,
    inicio,
    fin,
    venceEl: dateToDateKey(cycle.venceEl),
    etiqueta: cycleLabel(inicio, fin),
    actual: inicio <= today && today <= fin,
    estado: cycle.estado,
    situacion: cycle.situacion,
    congelado: num(cycle.pagado) > 0,
    clases: cycle.clases,
    alumnos: cycle.alumnos,
    sinMarcar: cycle.sinMarcar,
    generado: MONEY(cycle.generado),
    cobradoDespues: MONEY(cycle.cobradoDespues),
    sueldo: MONEY(cycle.sueldo),
    ajustes: MONEY(cycle.ajustes),
    adelantos: MONEY(cycle.adelantos),
    neto: MONEY(cycle.neto),
    pagado: MONEY(cycle.pagado),
    pendiente: MONEY(cycle.pendiente),
    detalle: cycle.classes
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.horaInicio.localeCompare(b.horaInicio))
      .map((row) => ({
        id: row.id,
        scheduleId: row.scheduleId,
        fecha: dateToDateKey(row.fecha),
        horaInicio: row.horaInicio,
        disciplina: row.disciplina,
        alumnos: row.alumnos,
        inasistencias: row.inasistencias,
        sinMarcar: row.sinMarcar,
        valorClases: MONEY(row.valorClases),
        regla: row.regla,
        ganado: MONEY(row.ganado)
      }))
  };
}

export type InstructorCycleView = ReturnType<typeof serializeCycleView>;

function windowView(settings: SettingsRow, tipo: CycleType, today: string) {
  const cal = calendar(settings, tipo);
  const window = cycleContaining(today, cal);
  return {
    ...window,
    etiqueta: cycleLabel(window.inicio, window.fin),
    frecuencia: frequencyLabel(cal.frecuencia as PayFrequency, cal.diaPago)
  };
}

/**
 * R7/R9: lo que la pagina de Pagos necesita. Cada instructor con su ciclo actual
 * y los ciclos anteriores que aun deben algo (saldo anterior).
 */
export async function getInstructorPayments(clientId: string, now = new Date()) {
  await ensureInstructorLedger(clientId, now);
  const [settings, equipo] = await Promise.all([
    prisma.instructorPaymentSettings.findUnique({ where: { clientId } }),
    getTeamPaySummary(clientId)
  ]);
  if (!settings) return { configurado: false as const, equipo };
  const today = studioNow(now).dateKey;

  const instructors = await prisma.instructor.findMany({
    where: { clientId, deletedAt: null },
    include: {
      disciplines: true,
      cycles: {
        where: { OR: [{ pendiente: { gt: 0 } }, { fin: { gte: dateKeyToDate(today) } }] },
        include: { classes: true },
        orderBy: { inicio: "asc" }
      }
    },
    orderBy: { nombre: "asc" }
  });

  const people = instructors
    .map((instructor) => {
      const pay = instructorPay(instructor);
      const cycles = instructor.cycles.map((cycle) => serializeCycleView(cycle, today));
      return {
        id: instructor.id,
        nombre: instructorName(instructor),
        color: instructor.color,
        activo: instructor.activo,
        descripcionPago: pay.sueldo != null || pay.variable ? describePay(pay) : "Falta definir cómo se le paga",
        comision: cycles.filter((cycle) => cycle.tipo === "COMISION"),
        sueldo: cycles.filter((cycle) => cycle.tipo === "SUELDO")
      };
    })
    .filter((person) => person.comision.length || person.sueldo.length);

  const all = people.flatMap((person) => [...person.comision, ...person.sueldo]);
  return {
    configurado: true as const,
    equipo,
    hoy: today,
    settings: serializePaySettings(settings),
    ciclos: { comision: windowView(settings, "COMISION", today), sueldo: windowView(settings, "SUELDO", today) },
    resumen: {
      totalPendiente: all.reduce((sum, cycle) => sum + Math.max(0, cycle.pendiente), 0),
      instructores: people.filter((person) => [...person.comision, ...person.sueldo].some((cycle) => cycle.pendiente > 0)).length,
      clases: all.reduce((sum, cycle) => sum + (cycle.tipo === "COMISION" ? cycle.clases : 0), 0),
      saldosAnteriores: all.filter((cycle) => !cycle.actual && cycle.pendiente > 0).length,
      sinMarcar: all.reduce((sum, cycle) => sum + cycle.sinMarcar, 0)
    },
    instructores: people
  };
}

export type InstructorPaymentsView = Awaited<ReturnType<typeof getInstructorPayments>>;
