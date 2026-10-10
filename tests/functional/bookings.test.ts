// Spec 007: reservas, asistencia, clase suelta y su integridad con 005 y 006.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as bookingRoute from "@/app/api/bookings/[id]/route";
import * as optionsRoute from "@/app/api/bookings/options/route";
import * as profileRoute from "@/app/api/client/profile/route";
import * as scheduleRoute from "@/app/api/class-schedules/[id]/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import * as saleRoute from "@/app/api/member-packages/[id]/route";
import { addDaysToKey, isoWeekday, startOfWeekKey, studioTodayKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { type Catalog, createCatalog, createMember, createSchedule, nextDate, sell } from "./studio-fixtures";

after(disconnect);

type Booking = { id: string; estado: string; claseDevuelta: boolean; memberPackage: { id: string; clasesRestantes: number } };

async function setup(options: { cupo?: number } = {}) {
  const business = await createBusiness();
  const catalog: Catalog = await createCatalog(business.token);
  const [bodyCombat] = await createSchedule(business.token, catalog.disciplines.bodyCombat, [1], { cupo: options.cupo ?? 15 });
  const [jump] = await createSchedule(business.token, catalog.disciplines.jump, [1], { horaInicio: "19:00" });
  return { ...business, catalog, schedules: { bodyCombat: bodyCombat.id, jump: jump.id }, monday: nextDate(1) };
}

function book(token: string, body: Record<string, unknown>) {
  return call<Booking>(bookingsRoute.POST, { token, method: "POST", body });
}

async function remaining(saleId: string) {
  const sale = await prisma.memberPackage.findUniqueOrThrow({ where: { id: saleId } });
  return sale.clases - sale.clasesUsadas;
}

async function occupancy(token: string, scheduleId: string, fecha: string) {
  const sessions = expectOk<Array<{ scheduleId: string; reservadas: number; cupo: number }>>(
    await call(sessionsRoute.GET, { token, path: `/api/class-sessions?from=${startOfWeekKey(fecha)}&to=${addDaysToKey(startOfWeekKey(fecha), 6)}` })
  );
  const session = sessions.find((item) => item.scheduleId === scheduleId)!;
  return `${session.reservadas}/${session.cupo}`;
}

describe("spec 007 · reservar", () => {
  test("reservar con Básico (4) deja 3 clases y la clase en 1/15", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const member = await createMember(token);
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);

    const booking = expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 201);
    assert.equal(booking.estado, "RESERVADA");
    assert.equal(booking.memberPackage.id, sale.id);
    assert.equal(await remaining(sale.id), 3);
    assert.equal(await occupancy(token, schedules.bodyCombat, monday), "1/15");
  });

  test("no se reserva dos veces la misma clase", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const member = await createMember(token);
    await sell(token, member.id, catalog.packages.basicoBodyCombat);
    expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 201);
    expectError(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 409, /Ya tiene/);
  });

  test("clase llena: responde sin cupos", async () => {
    const { token, catalog, schedules, monday } = await setup({ cupo: 1 });
    const first = await createMember(token, "Uno");
    const second = await createMember(token, "Dos");
    await sell(token, first.id, catalog.packages.basicoBodyCombat);
    const sale = await sell(token, second.id, catalog.packages.basicoBodyCombat);
    expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: first.id }), 201);
    expectError(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: second.id }), 409, /Sin cupos/);
    assert.equal(await remaining(sale.id), 4, "no se descuenta si no entra");
  });

  test("dos reservas simultáneas por el último cupo: solo entra una", async () => {
    const { token, catalog, schedules, monday } = await setup({ cupo: 1 });
    const members = await Promise.all([createMember(token, "Ana"), createMember(token, "Bea"), createMember(token, "Cata")]);
    for (const member of members) await sell(token, member.id, catalog.packages.basicoBodyCombat);

    const results = await Promise.all(
      members.map((member) => book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }))
    );
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409, 409]);
    assert.equal(await prisma.booking.count({ where: { session: { scheduleId: schedules.bodyCombat } } }), 1);
  });

  test("Mix Studio sirve para Jump Power; Básico Body Combat no", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const mixMember = await createMember(token, "Mix");
    const bcMember = await createMember(token, "BC");
    await sell(token, mixMember.id, catalog.packages.basicoMix);
    await sell(token, bcMember.id, catalog.packages.basicoBodyCombat);

    expectOk(await book(token, { scheduleId: schedules.jump, fecha: monday, memberId: mixMember.id }), 201);
    expectError(await book(token, { scheduleId: schedules.jump, fecha: monday, memberId: bcMember.id }), 422, /paquete vigente/);
  });

  test("se usa el paquete que vence primero", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const member = await createMember(token);
    const later = await sell(token, member.id, catalog.packages.basicoBodyCombat);
    const sooner = await sell(token, member.id, catalog.packages.basicoMix, { inicio: addDaysToKey(studioTodayKey(), -20) });
    const booking = expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 201);
    assert.equal(booking.memberPackage.id, sooner.id);
    assert.equal(await remaining(later.id), 4);
  });

  test("un paquete vencido para la fecha de la clase no sirve", async () => {
    const { token, catalog, schedules } = await setup();
    const member = await createMember(token);
    // Vence en 29 días; la clase es el lunes después de esa fecha.
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);
    const lateMonday = nextDate(1, 31);
    expectError(await book(token, { scheduleId: schedules.bodyCombat, fecha: lateMonday, memberId: member.id }), 422);
    assert.equal(await remaining(sale.id), 4);
  });

  test("no se reserva una clase pasada ni una cancelada", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const member = await createMember(token);
    await sell(token, member.id, catalog.packages.basicoBodyCombat);
    expectError(
      await book(token, { scheduleId: schedules.bodyCombat, fecha: addDaysToKey(monday, -14), memberId: member.id }),
      422,
      /pasada/
    );
    await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedules.bodyCombat, fecha: monday, cancelada: true } });
    expectError(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 409, /cancelada/);
  });

  test("cliente sin paquete: vender clase suelta y reservar en un paso", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const member = await createMember(token);

    const options = expectOk<{ usable: unknown[]; sellable: Array<{ id: string; clases: number }> }>(
      await call(optionsRoute.GET, {
        token,
        path: `/api/bookings/options?memberId=${member.id}&scheduleId=${schedules.bodyCombat}&fecha=${monday}`
      })
    );
    assert.equal(options.usable.length, 0);
    // Body Combat ofrece Individual, Básico y el Básico del combo Mix.
    assert.deepEqual(options.sellable.map((item) => item.clases).sort(), [1, 4, 4]);

    const booking = expectOk(
      await book(token, {
        scheduleId: schedules.bodyCombat,
        fecha: monday,
        memberId: member.id,
        venta: { packageId: catalog.packages.individualBodyCombat, pago: { monto: 15000, metodoPago: "EFECTIVO" } }
      }),
      201
    );
    assert.equal(booking.memberPackage.clasesRestantes, 0);
    const sale = await prisma.memberPackage.findUniqueOrThrow({ where: { id: booking.memberPackage.id } });
    assert.equal(Number(sale.pagado), 15000);
  });

  test("si la venta no sirve para la clase, no queda ni la venta ni la reserva", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const member = await createMember(token);
    expectError(
      await book(token, {
        scheduleId: schedules.jump,
        fecha: monday,
        memberId: member.id,
        venta: { packageId: catalog.packages.basicoBodyCombat }
      }),
      422
    );
    assert.equal(await prisma.memberPackage.count({ where: { memberId: member.id } }), 0);
  });
});

describe("spec 007 · cancelar y asistencia", () => {
  test("cancelar a tiempo devuelve la clase", async () => {
    const { token, catalog, schedules, monday } = await setup();
    await call(profileRoute.PUT, { token, method: "PUT", body: { horasCancelacion: 0 } });
    const member = await createMember(token);
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);
    const booking = expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 201);

    const cancelled = expectOk<Booking>(await call(bookingRoute.PUT, { token, method: "PUT", params: { id: booking.id }, body: { cancelar: true } }));
    assert.equal(cancelled.claseDevuelta, true);
    assert.equal(await remaining(sale.id), 4);
    assert.equal(await occupancy(token, schedules.bodyCombat, monday), "0/15");
  });

  test("fuera de plazo no se devuelve, salvo que el dueño haga la excepción", async () => {
    const { token, catalog, schedules, monday } = await setup();
    // Plazo de 7 días: una clase de dentro de pocos días ya está fuera de plazo.
    await call(profileRoute.PUT, { token, method: "PUT", body: { horasCancelacion: 168 } });
    const late = await createMember(token, "Tarde");
    const excused = await createMember(token, "Excepción");
    const lateSale = await sell(token, late.id, catalog.packages.basicoBodyCombat);
    const excusedSale = await sell(token, excused.id, catalog.packages.basicoBodyCombat);
    const b1 = expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: late.id }), 201);
    const b2 = expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: excused.id }), 201);

    const r1 = expectOk<Booking>(await call(bookingRoute.PUT, { token, method: "PUT", params: { id: b1.id }, body: { cancelar: true } }));
    const r2 = expectOk<Booking>(
      await call(bookingRoute.PUT, { token, method: "PUT", params: { id: b2.id }, body: { cancelar: true, devolverClase: true } })
    );
    assert.equal(r1.claseDevuelta, false);
    assert.equal(await remaining(lateSale.id), 3);
    assert.equal(r2.claseDevuelta, true);
    assert.equal(await remaining(excusedSale.id), 4);
  });

  test("cancelar dos veces no devuelve dos clases", async () => {
    const { token, catalog, schedules, monday } = await setup();
    await call(profileRoute.PUT, { token, method: "PUT", body: { horasCancelacion: 0 } });
    const member = await createMember(token);
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);
    const booking = expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 201);
    const cancel = () => call(bookingRoute.PUT, { token, method: "PUT", params: { id: booking.id }, body: { cancelar: true } });
    const results = await Promise.all([cancel(), cancel()]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(await remaining(sale.id), 4);
  });

  test("quien canceló puede volver a reservar (se reutiliza su fila)", async () => {
    const { token, catalog, schedules, monday } = await setup();
    await call(profileRoute.PUT, { token, method: "PUT", body: { horasCancelacion: 0 } });
    const member = await createMember(token);
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);
    const first = expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 201);
    await call(bookingRoute.PUT, { token, method: "PUT", params: { id: first.id }, body: { cancelar: true } });
    const again = expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 201);
    assert.equal(again.id, first.id);
    assert.equal(again.estado, "RESERVADA");
    assert.equal(await remaining(sale.id), 3);
  });

  test("la asistencia no cambia el saldo de clases", async () => {
    const { token, catalog } = await setup();
    // Spec 019: la asistencia se marca el día de la clase o después.
    const today = studioTodayKey();
    const [todayClass] = await createSchedule(token, catalog.disciplines.bodyCombat, [isoWeekday(today)], { horaInicio: "06:00" });
    const member = await createMember(token);
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);
    const booking = expectOk(await book(token, { scheduleId: todayClass.id, fecha: today, memberId: member.id }), 201);
    for (const estado of ["ASISTIO", "NO_ASISTIO", "RESERVADA"]) {
      const updated = expectOk<Booking>(await call(bookingRoute.PUT, { token, method: "PUT", params: { id: booking.id }, body: { estado } }));
      assert.equal(updated.estado, estado);
    }
    assert.equal(await remaining(sale.id), 3);
  });
});

describe("spec 007 R4 · integridad con horario y ventas", () => {
  test("cancelar la clase del festivo cancela las reservas y devuelve la clase a todas", async () => {
    const { token, catalog, schedules, monday } = await setup();
    await call(profileRoute.PUT, { token, method: "PUT", body: { horasCancelacion: 168 } });
    const members = await Promise.all([createMember(token, "Ana"), createMember(token, "Bea")]);
    const sales = [];
    for (const member of members) {
      sales.push(await sell(token, member.id, catalog.packages.basicoBodyCombat));
      expectOk(await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id }), 201);
    }

    await call(sessionsRoute.PUT, {
      token,
      method: "PUT",
      body: { scheduleId: schedules.bodyCombat, fecha: monday, cancelada: true, motivoCancelacion: "Festivo" }
    });
    for (const sale of sales) assert.equal(await remaining(sale.id), 4);
    const states = await prisma.booking.findMany({ where: { session: { scheduleId: schedules.bodyCombat } } });
    assert.ok(states.every((booking) => booking.estado === "CANCELADA" && booking.claseDevuelta));
  });

  test("el cupo de una fecha no baja de las reservas que ya tiene", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const members = await Promise.all([createMember(token, "Ana"), createMember(token, "Bea")]);
    for (const member of members) {
      await sell(token, member.id, catalog.packages.basicoBodyCombat);
      await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id });
    }
    expectError(
      await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedules.bodyCombat, fecha: monday, cupo: 1 } }),
      409
    );
    expectOk(await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedules.bodyCombat, fecha: monday, cupo: 2 } }));
  });

  test("no se borra un horario con reservas próximas, ni se anula una venta con reservas", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const member = await createMember(token);
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);
    await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id });

    expectError(await call(scheduleRoute.DELETE, { token, method: "DELETE", params: { id: schedules.bodyCombat } }), 409, /reserva/);
    expectError(await call(saleRoute.PUT, { token, method: "PUT", params: { id: sale.id }, body: { anular: true } }), 409, /reserva/);
  });

  test("las reservas de un cliente y de una clase se listan; otro negocio no las ve", async () => {
    const { token, catalog, schedules, monday } = await setup();
    const other = await createBusiness();
    const member = await createMember(token);
    await sell(token, member.id, catalog.packages.basicoMix);
    await book(token, { scheduleId: schedules.bodyCombat, fecha: monday, memberId: member.id });
    await book(token, { scheduleId: schedules.jump, fecha: monday, memberId: member.id });

    const upcoming = expectOk<Booking[]>(await call(bookingsRoute.GET, { token, path: `/api/bookings?memberId=${member.id}` }));
    assert.equal(upcoming.length, 2);
    const roster = expectOk<Booking[]>(
      await call(bookingsRoute.GET, { token, path: `/api/bookings?scheduleId=${schedules.jump}&fecha=${monday}` })
    );
    assert.equal(roster.length, 1);
    const foreign = expectOk<Booking[]>(await call(bookingsRoute.GET, { token: other.token, path: `/api/bookings?memberId=${member.id}` }));
    assert.equal(foreign.length, 0);
    expectError(await call(bookingRoute.PUT, { token: other.token, method: "PUT", params: { id: roster[0].id }, body: { cancelar: true } }), 404);
  });
});
