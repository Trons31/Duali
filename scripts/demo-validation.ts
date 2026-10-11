/**
 * Spec 029: escenarios de validación sobre el usuario demo (demo@gmail.com).
 *
 * Deja en el demo un caso de cada cosa que hay que revisar antes de entregarle
 * la app a un estudio: asistencias pasadas (asistió / no asistió / sin marcar),
 * reservas próximas, planes vencidos, con saldo vencido, con abonos, renovados,
 * clase suelta, venta de varios paquetes y pagos en dos partes, un pago anulado,
 * egresos de este mes y del pasado, y tres instructores con ciclos de pago
 * anteriores ya pagados (total, en dos partes y parcial) y el ciclo de hoy por
 * pagar, para validar Pagos y Contabilidad el día de pago.
 *
 * Es aditivo e idempotente, igual que el seed de la spec 016: nunca crea
 * usuarios, cada escenario se salta si ya existe, y sin `apply` solo lee.
 * Todo pasa por la lógica de la app (rutas de la API y las mismas funciones).
 */
import { signToken } from "@/lib/auth";
import { findUsablePackages, consumeClass, createBooking } from "@/lib/bookings";
import { setAttendance } from "@/lib/attendance";
import { ensureClassSession, listClassSessions } from "@/lib/class-sessions";
import { ensureInstructorLedger, savePaySettings } from "@/lib/instructor-ledger";
import { payInstructor } from "@/lib/instructor-payments";
import { saveInstructor } from "@/lib/instructors";
import { prisma } from "@/lib/prisma";
import { addDaysToKey, dateKeyToDate, dateToDateKey, studioNow, timeKeyToMinutes } from "@/lib/studio-time";
import { instructorSchema } from "@/lib/validations";
import * as expensesRoute from "@/app/api/expenses/route";
import * as salesRoute from "@/app/api/member-packages/route";
import * as paymentsRoute from "@/app/api/member-packages/[id]/payments/route";
import * as paymentRoute from "@/app/api/member-packages/[id]/payments/[paymentId]/route";
import * as renewRoute from "@/app/api/member-packages/[id]/renew/route";
import { DEMO_EMAIL } from "./demo-studio";
import { COMBO } from "./studio-catalog-data";

/** Semanas de historia: los ciclos de pago y las ventas arrancan aquí. */
export const HISTORY_DAYS = 42;

type Log = (line: string) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada ruta tipa sus propios params
type Handler = (request: Request, context: { params: Promise<any> }) => Promise<Response>;
type Part = { metodo: string; monto: number };

const INSTRUCTORS = [
  { nombre: "Mateo", apellido: "Ríos", color: "#f43f5e", disciplina: "Body Combat", pago: { variable: "POR_CLASE", valor: 25_000 } },
  { nombre: "Laura", apellido: "Méndez", color: "#0ea5e9", disciplina: "Jump Power", pago: { variable: "ALUMNO_PORCENTAJE", valor: 40 } },
  { nombre: "Carolina", apellido: "Pérez", color: "#f97316", disciplina: "Rumba Fit", pago: { sueldo: 1_200_000 } }
] as const;

const EXPENSES = (today: string) => {
  const month = today.slice(0, 7);
  const lastMonth = addDaysToKey(`${month}-01`, -1).slice(0, 7);
  const clamp = (key: string) => (key > today ? today : key);
  return [
    { concepto: "Arriendo del local (mes pasado)", categoria: "RENT", monto: 500_000, fecha: `${lastMonth}-05`, metodoPago: "TRANSFERENCIA" },
    { concepto: "Publicidad en Instagram", categoria: "MARKETING", monto: 150_000, fecha: `${lastMonth}-18`, metodoPago: "BANCOLOMBIA" },
    { concepto: "Arriendo del local", categoria: "RENT", monto: 500_000, fecha: clamp(`${month}-05`), metodoPago: "TRANSFERENCIA" },
    {
      concepto: "Servicios públicos",
      categoria: "UTILITIES",
      monto: 180_000,
      fecha: addDaysToKey(today, -6),
      partes: [
        { metodo: "EFECTIVO", monto: 120_000 },
        { metodo: "NEQUI", monto: 60_000 }
      ]
    },
    { concepto: "Insumos de limpieza", categoria: "SUPPLIES", monto: 95_000, fecha: addDaysToKey(today, -2), metodoPago: "EFECTIVO" },
    { concepto: "Agua y café para las clientas", categoria: "FOOD", monto: 38_000, fecha: today, metodoPago: "EFECTIVO" }
  ];
};

export async function seedDemoValidation(options: { apply: boolean; email?: string; log?: Log; instant?: Date }) {
  const log = options.log ?? console.log;
  const { apply } = options;
  const email = (options.email ?? DEMO_EMAIL).toLowerCase();
  const now = studioNow(options.instant);
  const today = now.dateKey;
  const start = addDaysToKey(today, -HISTORY_DAYS);
  log(`${apply ? "APLICANDO" : "SIMULACION (usa --apply para escribir)"} · escenarios de validación (${email}) · hoy ${today}`);

  const client = await prisma.client.findFirst({ where: { email, deletedAt: null } });
  if (!client) throw new Error(`No existe un usuario activo con el correo ${email}`);
  if (!client.moduloEstudio) throw new Error("El usuario no tiene el módulo Estudio. Corre primero el seed del estudio demo (spec 016).");
  const clientId = client.id;
  const token = signToken(client);

  const disciplines = await prisma.discipline.findMany({ where: { clientId, deletedAt: null }, select: { id: true, nombre: true } });
  const disciplineId = (nombre: string) => {
    const found = disciplines.find((item) => item.nombre.toLocaleLowerCase("es") === nombre.toLocaleLowerCase("es"));
    if (!found) throw new Error(`Falta la disciplina ${nombre}. Corre primero el seed del estudio demo (spec 016).`);
    return found.id;
  };
  const packageId = async (disciplina: string, nombre: string) =>
    (await prisma.package.findFirstOrThrow({ where: { clientId, disciplineId: disciplineId(disciplina), nombre, deletedAt: null }, select: { id: true } })).id;

  async function api<T>(handler: Handler, method: string, body: unknown, params: Record<string, string> = {}): Promise<T> {
    const response = await handler(
      new Request("http://seed.local/", { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }),
      { params: Promise.resolve(params) }
    );
    const payload = (await response.json()) as { ok: boolean; data: T; error?: string };
    if (!response.ok) throw new Error(payload.error ?? `La API respondió ${response.status}`);
    return payload.data;
  }

  // ── 1. Instructores titulares y su historia de pagos ────────────────────────
  const instructorIds = new Map<string, string>();
  for (const item of INSTRUCTORS) {
    const existing = await prisma.instructor.findFirst({ where: { clientId, nombre: item.nombre, apellido: item.apellido, deletedAt: null } });
    if (existing) {
      instructorIds.set(item.disciplina, existing.id);
      log(`  = instructor ${item.nombre} ${item.apellido}`);
      continue;
    }
    log(`  + instructor ${item.nombre} ${item.apellido} · ${"sueldo" in item.pago ? "sueldo mensual" : item.pago.variable}`);
    if (!apply) continue;
    const input = instructorSchema.parse({
      nombre: item.nombre,
      apellido: item.apellido,
      color: item.color,
      ...item.pago,
      disciplinas: [{ disciplineId: disciplineId(item.disciplina) }]
    });
    const saved = (await saveInstructor(clientId, input)) as { id: string };
    // Lleva tiempo en el estudio: sus ciclos arrancan con la historia.
    await prisma.instructor.update({ where: { id: saved.id }, data: { createdAt: new Date(`${start}T12:00:00.000Z`) } });
    instructorIds.set(item.disciplina, saved.id);
  }

  // Titular de cada clase que aún no tiene instructor (no cambia los que ya tienen).
  for (const item of INSTRUCTORS) {
    const free = await prisma.classSchedule.count({ where: { clientId, deletedAt: null, disciplineId: disciplineId(item.disciplina), instructorId: null, instructor: null } });
    if (!free) continue;
    log(`  + ${item.nombre} queda de titular en ${free} clase(s) de ${item.disciplina}`);
    const id = instructorIds.get(item.disciplina);
    if (apply && id) {
      await prisma.classSchedule.updateMany({ where: { clientId, deletedAt: null, disciplineId: disciplineId(item.disciplina), instructorId: null, instructor: null }, data: { instructorId: id } });
    }
  }

  // Pagos a instructores: semanal y día de pago domingo (como el demo), activos desde hace seis semanas.
  const settings = await prisma.instructorPaymentSettings.findUnique({ where: { clientId } });
  if (!settings) {
    log("  + pagos a instructores: semanal, día de pago domingo; sueldos mensuales el 15");
    if (apply) {
      await savePaySettings(clientId, {
        frecuencia: "SEMANAL",
        diaPago: 7,
        frecuenciaSueldo: "MENSUAL",
        diaPagoSueldo: 15,
        diaPagoAbreSiguiente: false,
        inasistenciasCuentan: false,
        pagarClasesVacias: false,
        basePorcentaje: "VENDIDO"
      }, options.instant);
    }
  }
  if (!settings || dateToDateKey(settings.activadoEl) > start) {
    log(`  + los pagos a instructores cuentan desde ${start} (para tener ciclos anteriores)`);
    if (apply) await prisma.instructorPaymentSettings.update({ where: { clientId }, data: { activadoEl: dateKeyToDate(start) } });
  }

  // ── 2. Clientas con su historia ────────────────────────────────────────────
  // Un horario no inventa clases antes de existir (spec 005): para tener semanas
  // pasadas con asistencias, los horarios del demo cuentan desde el inicio de la historia.
  const historyStart = new Date(`${start}T05:00:00.000Z`);
  const newer = await prisma.classSchedule.count({ where: { clientId, deletedAt: null, createdAt: { gt: historyStart } } });
  if (newer) {
    log(`  + ${newer} horario(s) cuentan desde ${start} (para tener clases pasadas)`);
    if (apply) await prisma.classSchedule.updateMany({ where: { clientId, deletedAt: null, createdAt: { gt: historyStart } }, data: { createdAt: historyStart } });
  }
  const sessions = (await listClassSessions(clientId, start, addDaysToKey(today, 7))).filter((session) => !session.cancelada);
  const ended = (session: (typeof sessions)[number]) =>
    session.fecha < today || (session.fecha === today && timeKeyToMinutes(session.horaFin) <= now.minutes);
  const allowed = (disciplina: string) => (disciplina === COMBO.nombre ? COMBO.incluye : [disciplina]);

  /** Una clase ya dictada con su asistencia: lo mismo que reservar y luego marcar. */
  async function attend(memberId: string, scheduleId: string, fecha: string, estado: "ASISTIO" | "NO_ASISTIO" | "RESERVADA") {
    const booking = await prisma.$transaction(async (tx) => {
      const session = await ensureClassSession(clientId, scheduleId, fecha, tx);
      const exists = await tx.booking.findUnique({ where: { sessionId_memberId: { sessionId: session.id, memberId } } });
      if (exists) return null;
      const schedule = await tx.classSchedule.findUniqueOrThrow({ where: { id: scheduleId }, select: { disciplineId: true } });
      const [usable] = await findUsablePackages(tx, { clientId, memberId, disciplineId: schedule.disciplineId, fecha });
      if (!usable) return null;
      await consumeClass(tx, usable.id);
      return tx.booking.create({ data: { clientId, sessionId: session.id, memberId, memberPackageId: usable.id, estado: "RESERVADA", origen: "PANEL" } });
    });
    if (booking && estado !== "RESERVADA") await setAttendance(clientId, booking.id, estado, new Date(`${fecha}T23:30:00.000Z`));
    return Boolean(booking);
  }

  /** Asistencias en las clases de su disciplina entre dos fechas; `pattern` dice qué pasó en cada una. */
  async function history(memberId: string, disciplina: string, from: string, to: string, pattern: Array<"ASISTIO" | "NO_ASISTIO" | "RESERVADA">) {
    const pool = sessions.filter((session) => allowed(disciplina).includes(session.discipline.nombre) && session.fecha >= from && session.fecha <= to && ended(session));
    let done = 0;
    // Una clase de cada dos: una clienta real no va a todas.
    for (const [index, session] of pool.filter((_, position) => position % 2 === 0).entries()) {
      if (index >= pattern.length) break;
      if (await attend(memberId, session.scheduleId, session.fecha, pattern[index])) done += 1;
    }
    return done;
  }

  async function upcoming(memberId: string, disciplina: string, count: number) {
    const pool = sessions.filter((session) => allowed(disciplina).includes(session.discipline.nombre) && !ended(session) && session.fecha >= today);
    let done = 0;
    for (const session of pool) {
      if (done >= count) break;
      try {
        await createBooking({ clientId, scheduleId: session.scheduleId, fecha: session.fecha, memberId, origen: "PANEL" });
        done += 1;
      } catch {
        // Sin cupo o sin clases en el plan: se prueba con la siguiente.
      }
    }
    return done;
  }

  const sell = (memberId: string, pkg: string, inicio: string, extra: Record<string, unknown> = {}) =>
    api<{ id: string; precio: number }>(salesRoute.POST as Handler, "POST", { memberId, packageId: pkg, inicio, ...extra });
  const pay = (saleId: string, monto: number, fecha: string, metodo: string | Part[]) =>
    api<{ id: string; payments: Array<{ id: string }> }>(
      paymentsRoute.POST as Handler,
      "POST",
      { monto, fecha, ...(typeof metodo === "string" ? { metodoPago: metodo } : { partes: metodo }) },
      { id: saleId }
    );

  const SCENARIOS: Array<{ nombre: string; apellido: string; celular: string; resumen: string; run: (memberId: string) => Promise<string> }> = [
    {
      nombre: "Juliana",
      apellido: "Castro",
      celular: "3000000201",
      resumen: "plan vencido sin renovar, con asistencias y una falta",
      run: async (memberId) => {
        const inicio = addDaysToKey(today, -40);
        const sale = await sell(memberId, await packageId("Body Combat", "Plus"), inicio);
        await pay(sale.id, sale.precio, inicio, "EFECTIVO");
        const clases = await history(memberId, "Body Combat", inicio, addDaysToKey(inicio, 29), ["ASISTIO", "ASISTIO", "NO_ASISTIO", "ASISTIO", "ASISTIO", "ASISTIO"]);
        return `${clases} clases`;
      }
    },
    {
      nombre: "Mariana",
      apellido: "Díaz",
      celular: "3000000202",
      resumen: "saldo vencido (no ha pagado nada) y una clase de ayer sin marcar",
      run: async (memberId) => {
        const inicio = addDaysToKey(today, -25);
        await sell(memberId, await packageId("Rumba Fit", "Plus"), inicio, { fechaLimitePago: addDaysToKey(inicio, 7) });
        const clases = await history(memberId, "Rumba Fit", inicio, addDaysToKey(today, -3), ["ASISTIO", "ASISTIO", "NO_ASISTIO", "ASISTIO"]);
        // Las clases de los últimos días quedan sin asistencia marcada (aparecen en Inicio).
        const recent = sessions.filter((session) => allowed("Rumba Fit").includes(session.discipline.nombre) && session.fecha >= addDaysToKey(today, -2) && ended(session));
        let pendientes = 0;
        for (const session of recent.slice(0, 1)) if (await attend(memberId, session.scheduleId, session.fecha, "RESERVADA")) pendientes += 1;
        return `${clases} clases, ${pendientes} sin marcar`;
      }
    },
    {
      nombre: "Paula",
      apellido: "Herrera",
      celular: "3000000203",
      resumen: "Premium Mix Studio con dos abonos (uno en dos partes, hoy) y saldo por pagar",
      run: async (memberId) => {
        const inicio = addDaysToKey(today, -10);
        const sale = await sell(memberId, await packageId("Mix Studio", "Premium"), inicio, { fechaLimitePago: addDaysToKey(today, 5) });
        await pay(sale.id, 100_000, inicio, "NEQUI");
        await pay(sale.id, 50_000, today, [
          { metodo: "BANCOLOMBIA", monto: 30_000 },
          { metodo: "EFECTIVO", monto: 20_000 }
        ]);
        const clases = await history(memberId, "Mix Studio", inicio, today, ["ASISTIO", "ASISTIO", "ASISTIO"]);
        const proximas = await upcoming(memberId, "Mix Studio", 1);
        return `${clases} clases, ${proximas} reserva próxima`;
      }
    },
    {
      nombre: "Isabella",
      apellido: "Moreno",
      celular: "3000000204",
      resumen: "plan renovado (el anterior pagado por transferencia, el nuevo por Nequi)",
      run: async (memberId) => {
        const inicio = addDaysToKey(today, -35);
        const sale = await sell(memberId, await packageId("Jump Power", "Básico"), inicio);
        await pay(sale.id, sale.precio, inicio, "TRANSFERENCIA");
        const clases = await history(memberId, "Jump Power", inicio, addDaysToKey(inicio, 29), ["ASISTIO", "ASISTIO", "ASISTIO", "ASISTIO"]);
        const renewal = await api<{ id: string; precio: number }>(renewRoute.POST as Handler, "POST", { inicio: addDaysToKey(today, -5) }, { id: sale.id });
        await pay(renewal.id, renewal.precio, addDaysToKey(today, -5), "NEQUI");
        await history(memberId, "Jump Power", addDaysToKey(today, -5), today, ["ASISTIO"]);
        const proximas = await upcoming(memberId, "Jump Power", 1);
        return `${clases} clases del plan anterior, ${proximas} reserva próxima`;
      }
    },
    {
      nombre: "Valeria",
      apellido: "Gil",
      celular: "3000000205",
      resumen: "un pago anulado por error y luego el pago bueno",
      run: async (memberId) => {
        const inicio = addDaysToKey(today, -15);
        const sale = await sell(memberId, await packageId("Rumba Fit", "Básico"), inicio);
        const first = await pay(sale.id, sale.precio, inicio, "EFECTIVO");
        await api(paymentRoute.DELETE as Handler, "DELETE", {}, { id: sale.id, paymentId: first.payments[0].id });
        await pay(sale.id, sale.precio, addDaysToKey(inicio, 1), "NEQUI");
        const clases = await history(memberId, "Rumba Fit", inicio, today, ["ASISTIO", "ASISTIO"]);
        return `${clases} clases`;
      }
    },
    {
      nombre: "Gabriela",
      apellido: "Suárez",
      celular: "3000000206",
      resumen: "llegó sin reservar a una clase suelta y la pagó ahí",
      run: async (memberId) => {
        const session = sessions.filter((item) => item.discipline.nombre === "Body Combat" && item.fecha < today).at(-1);
        if (!session) return "sin clase pasada de Body Combat";
        const individual = await prisma.package.findUniqueOrThrow({ where: { id: await packageId("Body Combat", "Individual") }, select: { id: true, precio: true } });
        await createBooking({
          clientId,
          scheduleId: session.scheduleId,
          fecha: session.fecha,
          memberId,
          llegoSinReservar: true,
          venta: { packageId: individual.id, pago: { monto: Number(individual.precio), metodoPago: "EFECTIVO" } }
        });
        return `clase del ${session.fecha}`;
      }
    },
    {
      nombre: "Natalia",
      apellido: "Vargas",
      celular: "3000000207",
      resumen: "hoy compró dos disciplinas en una venta y pagó en dos partes",
      run: async (memberId) => {
        const items = [
          { packageId: await packageId("Body Combat", "Básico"), inicio: today },
          { packageId: await packageId("Jump Power", "Básico"), inicio: today }
        ];
        const catalog = await prisma.package.findMany({ where: { id: { in: items.map((item) => item.packageId) } }, select: { precio: true } });
        const total = catalog.reduce((sum, item) => sum + Number(item.precio), 0);
        await api(salesRoute.POST as Handler, "POST", {
          memberId,
          items,
          pago: {
            monto: total,
            partes: [
              { metodo: "EFECTIVO", monto: Math.round(total * 0.6) },
              { metodo: "NEQUI", monto: total - Math.round(total * 0.6) }
            ]
          }
        });
        const proximas = (await upcoming(memberId, "Body Combat", 1)) + (await upcoming(memberId, "Jump Power", 1));
        return `${proximas} reservas próximas`;
      }
    }
  ];

  for (const scenario of SCENARIOS) {
    const existing = await prisma.studioMember.findUnique({ where: { clientId_celular: { clientId, celular: scenario.celular } } });
    if (existing && (await prisma.memberPackage.count({ where: { memberId: existing.id } }))) {
      log(`  = ${scenario.nombre} ${scenario.apellido} (${scenario.resumen})`);
      continue;
    }
    log(`  + ${scenario.nombre} ${scenario.apellido}: ${scenario.resumen}`);
    if (!apply) continue;
    const member =
      existing ?? (await prisma.studioMember.create({ data: { clientId, nombre: scenario.nombre, apellido: scenario.apellido, celular: scenario.celular } }));
    try {
      log(`    ${await scenario.run(member.id)}`);
    } catch (error) {
      log(`    ! ${error instanceof Error ? error.message : error}`);
    }
  }

  // ── 3. Egresos de este mes y del pasado ────────────────────────────────────
  for (const expense of EXPENSES(today)) {
    if (await prisma.expense.findFirst({ where: { clientId, concepto: expense.concepto, deletedAt: null }, select: { id: true } })) {
      log(`  = egreso ${expense.concepto}`);
      continue;
    }
    log(`  + egreso ${expense.concepto} · ${expense.fecha}`);
    if (apply) await api(expensesRoute.POST as Handler, "POST", expense);
  }

  // ── 4. Ciclos de instructores y pagos anteriores ───────────────────────────
  if (!apply) return log("  + ciclos de instructores y pagos anteriores (se calculan al aplicar)");
  // El ledger solo crea ciclos hacia adelante desde el último: si ya creó el de
  // hoy (al activar los pagos o al crear al instructor), los anteriores nunca
  // aparecerían. Los ciclos sin pagos se recalculan siempre, así que se pueden
  // rehacer sin perder nada; solo los de los instructores de este seed sin pagos.
  for (const instructorId of instructorIds.values()) {
    if (await prisma.instructorPayment.count({ where: { instructorId } })) continue;
    await prisma.instructorCycle.deleteMany({ where: { instructorId, pagado: 0 } });
  }
  await ensureInstructorLedger(clientId, options.instant);
  const plans: Record<string, Array<"TOTAL" | "DOS_PARTES" | "PARCIAL">> = {
    "Body Combat": ["TOTAL", "DOS_PARTES", "TOTAL", "TOTAL"],
    "Jump Power": ["TOTAL", "PARCIAL", "TOTAL", "TOTAL"],
    "Rumba Fit": ["TOTAL"]
  };
  for (const item of INSTRUCTORS) {
    const instructorId = instructorIds.get(item.disciplina);
    if (!instructorId) continue;
    if (await prisma.instructorPayment.count({ where: { instructorId } })) {
      log(`  = pagos anteriores de ${item.nombre}`);
      continue;
    }
    const tipo = "sueldo" in item.pago ? "SUELDO" : "COMISION";
    const due = await prisma.instructorCycle.findMany({
      where: { instructorId, tipo, venceEl: { lt: dateKeyToDate(today) }, pendiente: { gt: 0 } },
      orderBy: { inicio: "asc" }
    });
    // El último ciclo vencido queda sin pagar: hoy se ve como "saldo anterior".
    const toPay = tipo === "SUELDO" ? due : due.slice(0, -1);
    let paid = 0;
    for (const [index, cycle] of toPay.entries()) {
      const kind = plans[item.disciplina][index] ?? "TOTAL";
      const pendiente = Math.round(Number(cycle.pendiente));
      const monto = kind === "PARCIAL" ? Math.round(pendiente / 2) : pendiente;
      if (monto <= 0) continue;
      const metodos =
        kind === "DOS_PARTES"
          ? [
              { metodo: "EFECTIVO", monto: Math.round(monto / 2) },
              { metodo: "NEQUI", monto: monto - Math.round(monto / 2) }
            ]
          : [{ metodo: tipo === "SUELDO" ? "TRANSFERENCIA" : "EFECTIVO", monto }];
      const payment = (await payInstructor(
        clientId,
        { instructorId, tipo, alcance: "SALDO", monto, metodos: metodos as never, nota: kind === "PARCIAL" ? "Abono; el resto la próxima semana" : null },
        options.instant
      )) as { id: string };
      // Se pagó el día de pago de ese ciclo: así se ve en el historial y en Contabilidad.
      const fecha = new Date(`${dateToDateKey(cycle.venceEl)}T17:00:00.000Z`);
      const row = await prisma.instructorPayment.update({ where: { id: payment.id }, data: { fecha }, select: { expenseId: true } });
      if (row.expenseId) await prisma.expense.update({ where: { id: row.expenseId }, data: { fecha } });
      paid += 1;
    }
    log(`  + ${paid} pago(s) anteriores a ${item.nombre}; ${due.length - toPay.length ? "el último ciclo queda por pagar hoy" : "sin saldo anterior"}`);
  }
  await ensureInstructorLedger(clientId, options.instant);
  log("Listo. Revisa la guía de validación en specs/029-seed-validacion-demo/spec.md");
}
