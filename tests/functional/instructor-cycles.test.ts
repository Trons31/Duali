// Spec 023 fase 2: ciclos de pago de instructores y cálculo por clase.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as instructorsRoute from "@/app/api/instructors/route";
import * as paymentsRoute from "@/app/api/instructor-payments/route";
import * as settingsRoute from "@/app/api/instructor-payments/settings/route";
import * as schedulesRoute from "@/app/api/class-schedules/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as salePaymentsRoute from "@/app/api/member-packages/[id]/payments/route";
import { getInstructorPayments, savePaySettings, type InstructorCycleView } from "@/lib/instructor-ledger";
import { addDaysToKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, nextDate, sell } from "./studio-fixtures";

after(disconnect);

const WEEKLY = {
  frecuencia: "SEMANAL" as const,
  diaPago: 7,
  frecuenciaSueldo: "MENSUAL" as const,
  diaPagoSueldo: 15,
  diaPagoAbreSiguiente: false,
  inasistenciasCuentan: false,
  pagarClasesVacias: false,
  basePorcentaje: "VENDIDO" as const
};

/** Un instante en Bogotá: la fecha a las 8 p. m., cuando las clases de las 6 ya terminaron. */
const at = (fecha: string, hora = "20:00") => new Date(`${fecha}T${hora}:00-05:00`);

async function studio() {
  const business = await createBusiness();
  const catalog = await createCatalog(business.token);
  return { ...business, catalog, monday: nextDate(1) };
}

async function instructor(token: string, body: Record<string, unknown>) {
  return expectOk<{ id: string }>(await call(instructorsRoute.POST, { token, method: "POST", body: { nombre: "Laura", ...body } }), 201);
}

async function schedule(token: string, disciplineId: string, dia: number, instructorId: string | null) {
  const [row] = expectOk<Array<{ id: string }>>(
    await call(schedulesRoute.POST, {
      token,
      method: "POST",
      body: { disciplineId, dias: [dia], horaInicio: "18:00", duracionMin: 60, cupo: 20, instructorId }
    }),
    201
  );
  return row.id;
}

/** N clientas con su plan, reservadas en la clase, con el estado de asistencia dado. */
async function fill(token: string, packageId: string, scheduleId: string, fecha: string, estados: string[], sale: Record<string, unknown> = {}) {
  const ids: Array<{ bookingId: string; saleId: string }> = [];
  for (const estado of estados) {
    const member = await createMember(token, "Alumna");
    const sold = await sell(token, member.id, packageId, sale);
    const booking = expectOk<{ id: string }>(await call(bookingsRoute.POST, { token, method: "POST", body: { scheduleId, fecha, memberId: member.id } }), 201);
    if (estado !== "RESERVADA") await prisma.booking.update({ where: { id: booking.id }, data: { estado: estado as "ASISTIO" } });
    ids.push({ bookingId: booking.id, saleId: sold.id });
  }
  return ids;
}

async function cyclesOf(clientId: string, instructorId: string, now: Date) {
  const view = await getInstructorPayments(clientId, now);
  assert.ok(view.configurado);
  const person = view.instructores.find((item) => item.id === instructorId);
  return { view, comision: person?.comision ?? [], sueldo: person?.sueldo ?? [] };
}

const current = (cycles: InstructorCycleView[], fecha: string) => cycles.find((cycle) => cycle.inicio <= fecha && fecha <= cycle.fin)!;

describe("spec 023 · ciclo de pago (R6)", () => {
  test("sin instructores no se configura; con ellos se guarda y valida el día de pago", async () => {
    const { token } = await studio();
    const empty = expectOk<{ configurado: boolean; equipo: { instructores: number } }>(await call(paymentsRoute.GET, { token }));
    assert.deepEqual([empty.configurado, empty.equipo.instructores], [false, 0]);
    assert.equal(expectOk(await call(settingsRoute.GET, { token })), null);
    expectError(await call(settingsRoute.PUT, { token, method: "PUT", body: WEEKLY }), 409, /instructores/);

    // Solo comisiones: el resumen dice que no hay sueldos (la pantalla no muestra ese calendario).
    await instructor(token, { variable: "POR_CLASE", valor: 35000 });
    const team = expectOk<{ equipo: { instructores: number; comision: boolean; sueldo: boolean; porClase: boolean } }>(
      await call(paymentsRoute.GET, { token })
    ).equipo;
    assert.deepEqual([team.instructores, team.comision, team.sueldo, team.porClase], [1, true, false, true]);

    expectError(await call(settingsRoute.PUT, { token, method: "PUT", body: { ...WEEKLY, frecuencia: "MENSUAL", diaPago: 31 } }), 422);
    const saved = expectOk<{ frecuencia: string; diaPago: number; activadoEl: string }>(
      await call(settingsRoute.PUT, { token, method: "PUT", body: WEEKLY })
    );
    assert.equal(saved.frecuencia, "SEMANAL");
    assert.equal(saved.diaPago, 7);
    const view = expectOk<{ configurado: boolean; ciclos: { comision: { frecuencia: string } } }>(await call(paymentsRoute.GET, { token }));
    assert.equal(view.configurado, true);
    assert.equal(view.ciclos.comision.frecuencia, "Semanal, los domingos");
  });
});

describe("spec 023 · cálculo por clase (R7–R9)", () => {
  test("por alumno con mínimo: 8 alumnos $48.000, 3 alumnos sube a $30.000; las sin marcar se avisan", async () => {
    const { token, client, catalog, monday } = await studio();
    const laura = await instructor(token, { variable: "ALUMNO_FIJO", valor: 6000, minimoPorClase: 30000 });
    const mon = await schedule(token, catalog.disciplines.bodyCombat, 1, laura.id);
    const wed = await schedule(token, catalog.disciplines.bodyCombat, 3, laura.id);
    const wednesday = addDaysToKey(monday, 2);
    await savePaySettings(client.id, WEEKLY);
    await fill(token, catalog.packages.basicoBodyCombat, mon, monday, [...Array(8).fill("ASISTIO"), "NO_ASISTIO"]);
    await fill(token, catalog.packages.basicoBodyCombat, wed, wednesday, ["ASISTIO", "ASISTIO", "ASISTIO", "RESERVADA"]);

    const { comision, view } = await cyclesOf(client.id, laura.id, at(wednesday));
    const cycle = current(comision, monday);
    assert.deepEqual(
      cycle.detalle.map((row) => [row.fecha, row.alumnos, row.regla, row.ganado]),
      [
        [monday, 8, "VARIABLE", 48000],
        [wednesday, 3, "MINIMO", 30000]
      ]
    );
    assert.deepEqual([cycle.clases, cycle.alumnos, cycle.sinMarcar, cycle.generado, cycle.pendiente], [2, 11, 1, 78000, 78000]);
    assert.equal(view.configurado && view.resumen.sinMarcar, 1);
  });

  test("las inasistencias cuentan solo con el interruptor", async () => {
    const { token, client, catalog, monday } = await studio();
    const laura = await instructor(token, { variable: "ALUMNO_FIJO", valor: 6000 });
    const mon = await schedule(token, catalog.disciplines.bodyCombat, 1, laura.id);
    await savePaySettings(client.id, { ...WEEKLY, inasistenciasCuentan: true });
    await fill(token, catalog.packages.basicoBodyCombat, mon, monday, ["ASISTIO", "NO_ASISTIO"]);
    const { comision } = await cyclesOf(client.id, laura.id, at(monday));
    assert.equal(current(comision, monday).generado, 12000);
  });

  test("porcentaje: sobre lo vendido, o solo lo cobrado con 'Cobrado después' cuando paga el resto", async () => {
    const { token, client, catalog, monday } = await studio();
    const laura = await instructor(token, { variable: "ALUMNO_PORCENTAJE", valor: 40 });
    const mon = await schedule(token, catalog.disciplines.bodyCombat, 1, laura.id);
    await savePaySettings(client.id, { ...WEEKLY, basePorcentaje: "COBRADO" });
    // Básico: $55.000 / 4 clases = $13.750 por clase; pagado a la mitad aporta $6.875.
    const [{ saleId }] = await fill(token, catalog.packages.basicoBodyCombat, mon, monday, ["ASISTIO"], {
      pago: { monto: 27500, metodoPago: "EFECTIVO" }
    });

    let { comision } = await cyclesOf(client.id, laura.id, at(monday));
    let cycle = current(comision, monday);
    assert.equal(cycle.detalle[0].valorClases, 6875);
    assert.equal(cycle.generado, 2750);

    // Con lo vendido cuenta el valor completo.
    await savePaySettings(client.id, { ...WEEKLY, basePorcentaje: "VENDIDO" });
    ({ comision } = await cyclesOf(client.id, laura.id, at(monday)));
    assert.equal(current(comision, monday).generado, 5500);

    // Se paga ese ciclo (fase 3 lo hará la pantalla) y la clienta paga el resto.
    await savePaySettings(client.id, { ...WEEKLY, basePorcentaje: "COBRADO" });
    ({ comision } = await cyclesOf(client.id, laura.id, at(monday)));
    cycle = current(comision, monday);
    await prisma.instructorCycle.update({ where: { id: cycle.id }, data: { pagado: 2750, pendiente: 0, situacion: "PAGADO" } });
    expectOk(
      await call(salePaymentsRoute.POST, { token, method: "POST", params: { id: saleId }, body: { monto: 27500, metodoPago: "NEQUI" } }),
      201
    );

    const nextWeek = addDaysToKey(monday, 7);
    ({ comision } = await cyclesOf(client.id, laura.id, at(nextWeek, "08:00")));
    const paid = await prisma.instructorCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    assert.equal(Number(paid.generado), 2750, "el ciclo pagado no cambia");
    assert.equal(current(comision, nextWeek).cobradoDespues, 2750);
    // Consultar otra vez no lo suma dos veces.
    ({ comision } = await cyclesOf(client.id, laura.id, at(nextWeek, "09:00")));
    assert.equal(current(comision, nextWeek).cobradoDespues, 2750);
  });

  test("un reemplazo se le paga al reemplazo; una clase cancelada no se paga", async () => {
    const { token, client, catalog, monday } = await studio();
    const laura = await instructor(token, { variable: "POR_CLASE", valor: 35000 });
    const andres = await instructor(token, { nombre: "Andrés", variable: "POR_CLASE", valor: 30000 });
    const mon = await schedule(token, catalog.disciplines.bodyCombat, 1, laura.id);
    const wed = await schedule(token, catalog.disciplines.bodyCombat, 3, laura.id);
    const wednesday = addDaysToKey(monday, 2);
    await savePaySettings(client.id, WEEKLY);
    await fill(token, catalog.packages.basicoBodyCombat, mon, monday, ["ASISTIO"]);
    await fill(token, catalog.packages.basicoBodyCombat, wed, wednesday, ["ASISTIO"]);
    expectOk(await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: mon, fecha: monday, instructorId: andres.id } }));
    expectOk(await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: wed, fecha: wednesday, cancelada: true } }));

    const forLaura = await cyclesOf(client.id, laura.id, at(wednesday));
    const forAndres = await cyclesOf(client.id, andres.id, at(wednesday));
    assert.equal(current(forLaura.comision, monday).generado, 0);
    assert.deepEqual(current(forAndres.comision, monday).detalle.map((row) => [row.fecha, row.ganado]), [[monday, 30000]]);
  });

  test("por clase: sin alumnos solo con 'Pagar clases aunque no llegue nadie'", async () => {
    const { token, client, catalog, monday } = await studio();
    const laura = await instructor(token, { variable: "POR_CLASE", valor: 35000 });
    await schedule(token, catalog.disciplines.bodyCombat, 1, laura.id);
    await savePaySettings(client.id, WEEKLY);
    assert.equal(current((await cyclesOf(client.id, laura.id, at(monday))).comision, monday).generado, 0);
    await savePaySettings(client.id, { ...WEEKLY, pagarClasesVacias: true });
    assert.equal(current((await cyclesOf(client.id, laura.id, at(monday))).comision, monday).generado, 35000);
  });

  test("sueldo + variable: el sueldo va al ciclo de sueldos y lo variable al de comisiones", async () => {
    const { token, client, catalog, monday } = await studio();
    const laura = await instructor(token, { sueldo: 600000, variable: "ALUMNO_FIJO", valor: 4000 });
    const mon = await schedule(token, catalog.disciplines.bodyCombat, 1, laura.id);
    await savePaySettings(client.id, WEEKLY);
    await fill(token, catalog.packages.basicoBodyCombat, mon, monday, ["ASISTIO", "ASISTIO"]);
    const { comision, sueldo } = await cyclesOf(client.id, laura.id, at(monday));
    assert.equal(current(comision, monday).generado, 8000);
    const salary = current(sueldo, monday);
    assert.deepEqual([salary.sueldo, salary.generado, salary.clases, salary.neto], [600000, 0, 1, 600000]);
  });

  test("con un pago el ciclo queda congelado: una asistencia tardía no lo cambia", async () => {
    const { token, client, catalog, monday } = await studio();
    const laura = await instructor(token, { variable: "ALUMNO_FIJO", valor: 6000 });
    const mon = await schedule(token, catalog.disciplines.bodyCombat, 1, laura.id);
    await savePaySettings(client.id, WEEKLY);
    const [, late] = await fill(token, catalog.packages.basicoBodyCombat, mon, monday, ["ASISTIO", "RESERVADA"]);
    const cycle = current((await cyclesOf(client.id, laura.id, at(monday))).comision, monday);
    assert.equal(cycle.generado, 6000);

    await prisma.instructorCycle.update({ where: { id: cycle.id }, data: { pagado: 3000, situacion: "PARCIAL" } });
    await prisma.booking.update({ where: { id: late.bookingId }, data: { estado: "ASISTIO" } });
    const after = current((await cyclesOf(client.id, laura.id, at(monday, "21:00"))).comision, monday);
    assert.deepEqual([after.generado, after.congelado], [6000, true]);
  });

  test("cambiar el calendario rehace los ciclos sin pagos, sin duplicar", async () => {
    const { token, client, catalog, monday } = await studio();
    const laura = await instructor(token, { variable: "POR_CLASE", valor: 35000 });
    const mon = await schedule(token, catalog.disciplines.bodyCombat, 1, laura.id);
    await savePaySettings(client.id, WEEKLY);
    await fill(token, catalog.packages.basicoBodyCombat, mon, monday, ["ASISTIO"]);
    await cyclesOf(client.id, laura.id, at(monday));

    await savePaySettings(client.id, { ...WEEKLY, frecuencia: "MENSUAL", diaPago: 28 });
    const { comision } = await cyclesOf(client.id, laura.id, at(monday));
    const withClass = comision.filter((cycle) => cycle.detalle.length);
    assert.equal(withClass.length, 1);
    assert.equal(withClass[0].generado, 35000);
    assert.equal(withClass[0].fin.slice(8), "28");
  });
});
