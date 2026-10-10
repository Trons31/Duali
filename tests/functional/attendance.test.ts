// Spec 019: asistencia, politica de inasistencia, "llego sin reservar",
// pendientes del Inicio e historial de la ficha.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as attendanceRoute from "@/app/api/attendance/route";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as bookingRoute from "@/app/api/bookings/[id]/route";
import * as markAllRoute from "@/app/api/class-sessions/attendance/route";
import * as profileRoute from "@/app/api/client/profile/route";
import * as historyRoute from "@/app/api/studio-members/[id]/history/route";
import * as memberRoute from "@/app/api/studio-members/[id]/route";
import { getPendingAttendance } from "@/lib/attendance";
import { getStudioDashboard } from "@/lib/studio-dashboard";
import { isoWeekday, studioNow } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, createSchedule, nextDate, sell } from "./studio-fixtures";

after(disconnect);

type Booking = { id: string; estado: string; claseDevuelta: boolean; devuelta?: boolean };

// La clase de hoy es a las 18:00 (60 min): a las 23:00 ya termino.
const today = () => studioNow().dateKey;
const lateTonight = () => new Date(`${today()}T23:00:00-05:00`);

async function setup() {
  const business = await createBusiness();
  const catalog = await createCatalog(business.token);
  const [todayClass] = await createSchedule(business.token, catalog.disciplines.bodyCombat, [isoWeekday(today())]);
  const [futureClass] = await createSchedule(business.token, catalog.disciplines.rumba, [1], { horaInicio: "07:00" });
  return { ...business, catalog, scheduleId: todayClass.id, futureScheduleId: futureClass.id };
}

function book(token: string, body: Record<string, unknown>) {
  return call<Booking>(bookingsRoute.POST, { token, method: "POST", body });
}

function mark(token: string, id: string, estado: string) {
  return call<Booking>(bookingRoute.PUT, { token, method: "PUT", params: { id }, body: { estado } });
}

async function remaining(saleId: string) {
  const sale = await prisma.memberPackage.findUniqueOrThrow({ where: { id: saleId } });
  return sale.clases - sale.clasesUsadas;
}

async function bookedMember(token: string, packageId: string, scheduleId: string, nombre = "Laura") {
  const member = await createMember(token, nombre);
  const sale = await sell(token, member.id, packageId);
  const booking = expectOk(await book(token, { scheduleId, fecha: today(), memberId: member.id }), 201);
  return { member, sale, booking };
}

describe("spec 019 · marcar asistencia", () => {
  test("guarda la hora; por defecto faltar no devuelve la clase", async () => {
    const { token, catalog, scheduleId } = await setup();
    const { sale, booking } = await bookedMember(token, catalog.packages.basicoBodyCombat, scheduleId);

    expectOk(await mark(token, booking.id, "ASISTIO"));
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    assert.ok(row.asistenciaAt, "guarda cuándo se marcó");

    const missed = expectOk(await mark(token, booking.id, "NO_ASISTIO"));
    assert.equal(missed.devuelta, false);
    assert.equal(await remaining(sale.id), 3);

    expectOk(await mark(token, booking.id, "RESERVADA"));
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).asistenciaAt, null);
    assert.equal(await remaining(sale.id), 3);
  });

  test("no se marca la asistencia de una clase futura", async () => {
    const { token, catalog, futureScheduleId } = await setup();
    const member = await createMember(token);
    await sell(token, member.id, catalog.packages.basicoRumba);
    const booking = expectOk(await book(token, { scheduleId: futureScheduleId, fecha: nextDate(1), memberId: member.id }), 201);
    expectError(await mark(token, booking.id, "ASISTIO"), 422, /día de la clase/);
  });

  test("con «se devuelve la clase»: faltar la devuelve y desmarcar la vuelve a descontar", async () => {
    const { token, catalog, scheduleId } = await setup();
    expectOk(await call(profileRoute.PUT, { token, method: "PUT", body: { devolverClaseInasistencia: true } }));
    const { sale, booking } = await bookedMember(token, catalog.packages.basicoBodyCombat, scheduleId);

    const missed = expectOk(await mark(token, booking.id, "NO_ASISTIO"));
    assert.equal(missed.devuelta, true);
    assert.equal(missed.claseDevuelta, true);
    assert.equal(await remaining(sale.id), 4);

    // Marcar otra vez la misma falta no devuelve dos veces.
    expectOk(await mark(token, booking.id, "NO_ASISTIO"));
    assert.equal(await remaining(sale.id), 4);

    // Si cambia la politica, desmarcar igual vuelve a descontar lo que se devolvio.
    expectOk(await call(profileRoute.PUT, { token, method: "PUT", body: { devolverClaseInasistencia: false } }));
    const attended = expectOk(await mark(token, booking.id, "ASISTIO"));
    assert.equal(attended.claseDevuelta, false);
    assert.equal(await remaining(sale.id), 3);
  });

  test("«Todos asistieron» solo marca a quienes siguen sin marcar", async () => {
    const { token, catalog, scheduleId } = await setup();
    const ana = await bookedMember(token, catalog.packages.basicoBodyCombat, scheduleId, "Ana");
    const bea = await bookedMember(token, catalog.packages.basicoBodyCombat, scheduleId, "Bea");
    const cata = await bookedMember(token, catalog.packages.basicoBodyCombat, scheduleId, "Cata");
    expectOk(await mark(token, cata.booking.id, "NO_ASISTIO"));

    const result = expectOk<{ marcadas: number }>(
      await call(markAllRoute.POST, { token, method: "POST", body: { scheduleId, fecha: today() } })
    );
    assert.equal(result.marcadas, 2);
    const states = await prisma.booking.findMany({ where: { id: { in: [ana.booking.id, bea.booking.id, cata.booking.id] } } });
    assert.deepEqual(states.map((row) => row.estado).sort(), ["ASISTIO", "ASISTIO", "NO_ASISTIO"]);
  });
});

describe("spec 019 · llegó sin reservar", () => {
  test("con plan: descuenta la clase y queda Asistió", async () => {
    const { token, catalog, scheduleId } = await setup();
    const member = await createMember(token);
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);
    const booking = expectOk(await book(token, { scheduleId, fecha: today(), memberId: member.id, llegoSinReservar: true }), 201);
    assert.equal(booking.estado, "ASISTIO");
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    assert.equal(row.sinReserva, true);
    assert.ok(row.asistenciaAt);
    assert.equal(await remaining(sale.id), 3);
  });

  test("sin plan: se le vende una clase suelta y queda Asistió", async () => {
    const { token, catalog, scheduleId } = await setup();
    const member = await createMember(token);
    const booking = expectOk(
      await book(token, {
        scheduleId,
        fecha: today(),
        memberId: member.id,
        llegoSinReservar: true,
        venta: { packageId: catalog.packages.individualBodyCombat }
      }),
      201
    );
    assert.equal(booking.estado, "ASISTIO");
    const sales = await prisma.memberPackage.findMany({ where: { memberId: member.id } });
    assert.equal(sales.length, 1);
    assert.equal(sales[0].clases, 1);
    assert.equal(sales[0].clasesUsadas, 1);
  });

  test("no se registra la llegada a una clase futura", async () => {
    const { token, catalog, futureScheduleId } = await setup();
    const member = await createMember(token);
    await sell(token, member.id, catalog.packages.basicoRumba);
    expectError(
      await book(token, { scheduleId: futureScheduleId, fecha: nextDate(1), memberId: member.id, llegoSinReservar: true }),
      422
    );
  });
});

describe("spec 019 · pendientes, vista del día e historial", () => {
  test("clases terminadas sin marcar cuentan en el Inicio hasta marcarlas", async () => {
    const { client, token, catalog, scheduleId } = await setup();
    await bookedMember(token, catalog.packages.basicoBodyCombat, scheduleId, "Ana");
    await bookedMember(token, catalog.packages.basicoBodyCombat, scheduleId, "Bea");

    assert.equal((await getPendingAttendance(client.id, new Date(`${today()}T12:00:00-05:00`))).length, 0, "aún no termina");
    const pending = await getPendingAttendance(client.id, lateTonight());
    assert.equal(pending.length, 1);
    assert.equal(pending[0].pendientes, 2);
    assert.equal((await getStudioDashboard(client.id, lateTonight())).atender.asistenciaPendiente, 1);

    expectOk(await call(markAllRoute.POST, { token, method: "POST", body: { scheduleId, fecha: today() } }));
    assert.equal((await getPendingAttendance(client.id, lateTonight())).length, 0);
  });

  test("la vista del día trae la lista con clases restantes; otro negocio no la ve", async () => {
    const { token, catalog, scheduleId } = await setup();
    await bookedMember(token, catalog.packages.basicoBodyCombat, scheduleId);
    const day = expectOk<Array<{ scheduleId: string; bookings: Array<{ memberPackage: { clasesRestantes: number } }> }>>(
      await call(attendanceRoute.GET, { token, path: `/api/attendance?fecha=${today()}` })
    );
    const session = day.find((item) => item.scheduleId === scheduleId)!;
    assert.equal(session.bookings.length, 1);
    assert.equal(session.bookings[0].memberPackage.clasesRestantes, 3);

    const other = await createBusiness();
    const otherDay = expectOk<unknown[]>(await call(attendanceRoute.GET, { token: other.token, path: `/api/attendance?fecha=${today()}` }));
    assert.equal(otherDay.length, 0);
  });

  test("el historial cuadra con la barra del plan y es solo del negocio", async () => {
    const { token, catalog, scheduleId, futureScheduleId } = await setup();
    expectOk(await call(profileRoute.PUT, { token, method: "PUT", body: { devolverClaseInasistencia: true, horasCancelacion: 0 } }));
    const member = await createMember(token);
    // Mix Studio sirve para Body Combat (hoy) y Rumba (el lunes).
    const sale = await sell(token, member.id, catalog.packages.basicoMix);
    const todayBooking = expectOk(await book(token, { scheduleId, fecha: today(), memberId: member.id }), 201);
    expectOk(await book(token, { scheduleId: futureScheduleId, fecha: nextDate(1), memberId: member.id }), 201);
    expectOk(await mark(token, todayBooking.id, "NO_ASISTIO")); // devuelta: no cuenta

    const history = expectOk<Array<{ estado: string; claseDevuelta: boolean; memberPackageId: string }>>(
      await call(historyRoute.GET, { token, params: { id: member.id } })
    );
    assert.equal(history.length, 2);
    assert.ok(history.every((entry) => entry.memberPackageId === sale.id));

    const detail = expectOk<{ packages: Array<{ id: string; clases: number; clasesRestantes: number; uso: Record<string, number> }> }>(
      await call(memberRoute.GET, { token, params: { id: member.id } })
    );
    const item = detail.packages.find((entry) => entry.id === sale.id)!;
    assert.deepEqual(item.uso, { asistio: 0, falto: 0, reservadas: 1 });
    assert.equal(item.uso.asistio + item.uso.falto + item.uso.reservadas + item.clasesRestantes, item.clases);

    const other = await createBusiness();
    assert.deepEqual(expectOk(await call(historyRoute.GET, { token: other.token, params: { id: member.id } })), []);
  });
});
