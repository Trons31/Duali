// Spec 015: lista de espera de una clase llena.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as bookingRoute from "@/app/api/bookings/[id]/route";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as profileRoute from "@/app/api/client/profile/route";
import * as packageRoute from "@/app/api/packages/[id]/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import * as remindersRoute from "@/app/api/studio-reminders/route";
import * as publicBookingsRoute from "@/app/api/public/studios/[slug]/bookings/route";
import * as publicBookingRoute from "@/app/api/public/bookings/[token]/route";
import * as joinRoute from "@/app/api/public/studios/[slug]/waitlist/route";
import * as publicWaitlistRoute from "@/app/api/public/waitlist/[token]/route";
import * as waitlistRoute from "@/app/api/waitlist/route";
import * as waitlistEntryRoute from "@/app/api/waitlist/[id]/route";
import * as assignRoute from "@/app/api/waitlist/[id]/assign/route";
import { MAX_WAITLIST } from "@/lib/waitlist";
import { addDaysToKey, isoWeekday, studioTodayKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, createSchedule, sell } from "./studio-fixtures";

after(disconnect);

let counter = 0;
let phone = 3_150_000_000;

/** Estudio publicado con clases de 1 cupo todos los dias; la fecha queda a 3 dias (antes de 168 h). */
async function fullStudio() {
  const business = await createBusiness();
  const catalog = await createCatalog(business.token);
  const schedules = await createSchedule(business.token, catalog.disciplines.bodyCombat, [1, 2, 3, 4, 5, 6, 7], { cupo: 1 });
  counter += 1;
  const slug = `espera-${Date.now()}-${counter}`;
  expectOk(await call(publicPageRoute.PUT, { token: business.token, method: "PUT", body: { slug, paginaPublicaActiva: true } }));
  // Spec 021 D2: como antes, se vende por la web sin pagar.
  await prisma.client.updateMany({ where: { slug }, data: { permitirPagoEnEstudio: true } });
  const fecha = addDaysToKey(studioTodayKey(), 3);
  const scheduleId = schedules.find((item) => item.diaSemana === isoWeekday(fecha))!.id;
  return { ...business, catalog, slug, fecha, scheduleId };
}

type Studio = Awaited<ReturnType<typeof fullStudio>>;

function visitor(nombre: string) {
  phone += 1;
  return { nombre, celular: String(phone) };
}

async function book(s: Studio, who: { nombre: string; celular: string }) {
  return expectOk<{ accessToken: string }>(
    await call(publicBookingsRoute.POST, {
      token: "",
      method: "POST",
      params: { slug: s.slug },
      body: { scheduleId: s.scheduleId, fecha: s.fecha, ...who, packageId: s.catalog.packages.individualBodyCombat, pago: { tipo: "EN_ESTUDIO" } }
    }),
    201
  );
}

function join(s: Studio, who: { nombre: string; celular: string }, packageId?: string) {
  return call(joinRoute.POST, {
    token: "",
    method: "POST",
    params: { slug: s.slug },
    body: { scheduleId: s.scheduleId, fecha: s.fecha, ...who, ...(packageId ? { packageId } : {}) }
  });
}

async function joined(s: Studio, who: { nombre: string; celular: string }, packageId?: string) {
  return expectOk<{ estado: string; accessToken: string; posicion: number }>(await join(s, who, packageId ?? s.catalog.packages.individualBodyCombat), 201);
}

function cancelPublic(token: string) {
  return call(publicBookingRoute.PUT, { token: "", method: "PUT", params: { token }, body: { cancelar: true } });
}

const memberOf = (s: Studio, celular: string) =>
  prisma.studioMember.findUniqueOrThrow({ where: { clientId_celular: { clientId: s.client.id, celular } } });

const entryOf = (token: string) => prisma.waitlistEntry.findUniqueOrThrow({ where: { accessToken: token } });

describe("spec 015 · anotarse", () => {
  test("con cupo libre no deja anotarse: hay que reservar", async () => {
    const s = await fullStudio();
    expectError(await join(s, visitor("Laura"), s.catalog.packages.individualBodyCombat), 409, /cupos/);
  });

  test("clase llena: se anota sin descontar ni vender y recibe su puesto", async () => {
    const s = await fullStudio();
    const ana = visitor("Ana");
    await book(s, ana);

    const laura = visitor("Laura");
    const needs = expectOk<{ estado: string; opciones: Array<{ id: string }> }>(await join(s, laura));
    assert.equal(needs.estado, "NECESITA_PAQUETE");
    assert.ok(needs.opciones.some((item) => item.id === s.catalog.packages.individualBodyCombat));

    const first = await joined(s, laura);
    assert.equal(first.estado, "EN_ESPERA");
    assert.equal(first.posicion, 1);
    const lauraMember = await memberOf(s, laura.celular);
    assert.equal(await prisma.memberPackage.count({ where: { memberId: lauraMember.id } }), 0, "no se vende nada al anotarse");

    // Con plan vigente tampoco se descuenta nada mientras espera.
    const marta = await createMember(s.token, "Marta");
    const plan = await sell(s.token, marta.id, s.catalog.packages.basicoBodyCombat);
    const second = await joined(s, { nombre: "Marta", celular: marta.celular });
    assert.equal(second.posicion, 2);
    const sale = await prisma.memberPackage.findUniqueOrThrow({ where: { id: plan.id } });
    assert.equal(sale.clasesUsadas, 0);

    expectError(await join(s, laura, s.catalog.packages.individualBodyCombat), 409, /Ya estás/);
    expectError(await join(s, ana, s.catalog.packages.individualBodyCombat), 409, /Ya tienes un cupo/);

    const view = expectOk<{ estado: string; posicion: number; nombre: string }>(
      await call(publicWaitlistRoute.GET, { token: "", params: { token: second.accessToken } })
    );
    assert.equal(view.estado, "EN_ESPERA");
    assert.equal(view.posicion, 2);
    assert.equal(JSON.stringify(view).includes("Laura"), false, "no muestra datos de otras personas");
  });

  test(`la lista admite ${MAX_WAITLIST} personas; la siguiente recibe 409`, async () => {
    const s = await fullStudio();
    await book(s, visitor("Ana"));
    for (let index = 0; index < MAX_WAITLIST; index += 1) await joined(s, visitor(`Persona${index}`));
    expectError(await join(s, visitor("Tarde"), s.catalog.packages.individualBodyCombat), 409, /llena/);
  });

  test("un enlace inventado da 404", async () => {
    expectError(await call(publicWaitlistRoute.GET, { token: "", params: { token: "no-existe" } }), 404);
  });
});

describe("spec 015 · asignación del cupo", () => {
  test("cancelar a tiempo asigna a la primera con el plan que eligió (debiendo) y avisa a la dueña", async () => {
    const s = await fullStudio();
    const ana = await book(s, visitor("Ana"));
    const laura = visitor("Laura");
    const first = await joined(s, laura);
    const marta = await joined(s, visitor("Marta"));

    expectOk(await cancelPublic(ana.accessToken));

    const lauraMember = await memberOf(s, laura.celular);
    const booking = await prisma.booking.findFirstOrThrow({ where: { memberId: lauraMember.id }, include: { memberPackage: true } });
    assert.equal(booking.estado, "RESERVADA");
    assert.equal(booking.origen, "PUBLICO");
    assert.ok(booking.accessToken);
    assert.equal(Number(booking.memberPackage.precio) - Number(booking.memberPackage.pagado), 15000, "queda debiendo la clase suelta");
    assert.equal(booking.memberPackage.clasesUsadas, 1);

    const entry = await entryOf(first.accessToken);
    assert.equal(entry.estado, "ASIGNADA");
    assert.equal(entry.bookingId, booking.id);
    const view = expectOk<{ estado: string; reservaToken: string }>(
      await call(publicWaitlistRoute.GET, { token: "", params: { token: first.accessToken } })
    );
    assert.equal(view.reservaToken, booking.accessToken, "su enlace lleva a la reserva");

    assert.equal((await entryOf(marta.accessToken)).estado, "EN_ESPERA");
    const martaView = expectOk<{ posicion: number }>(await call(publicWaitlistRoute.GET, { token: "", params: { token: marta.accessToken } }));
    assert.equal(martaView.posicion, 1, "sube un puesto");

    const push = await prisma.notification.findFirst({ where: { clientId: s.client.id, type: "STUDIO_WAITLIST_ASSIGNED" } });
    assert.match(push?.title ?? "", /Laura tomó un cupo/);

    const reminders = expectOk<{ listaEspera: Array<{ tipo: string; mensaje: string; member: { nombre: string } }> }>(
      await call(remindersRoute.GET, { token: s.token })
    );
    assert.equal(reminders.listaEspera.length, 1);
    assert.equal(reminders.listaEspera[0].member.nombre, "Laura");
    assert.match(reminders.listaEspera[0].mensaje, /Se liberó un cupo/);
    assert.match(reminders.listaEspera[0].mensaje, /\$15\.000/);
  });

  test("con plan vigente se descuenta de él", async () => {
    const s = await fullStudio();
    const ana = await book(s, visitor("Ana"));
    const marta = await createMember(s.token, "Marta");
    const plan = await sell(s.token, marta.id, s.catalog.packages.basicoBodyCombat);
    await joined(s, { nombre: "Marta", celular: marta.celular });

    expectOk(await cancelPublic(ana.accessToken));
    const booking = await prisma.booking.findFirstOrThrow({ where: { memberId: marta.id } });
    assert.equal(booking.memberPackageId, plan.id);
    assert.equal((await prisma.memberPackage.findUniqueOrThrow({ where: { id: plan.id } })).clasesUsadas, 1);
    assert.equal(await prisma.memberPackage.count({ where: { memberId: marta.id } }), 1, "no se vende otro plan");
  });

  test("si la primera ya no tiene plan válido, el cupo pasa a la siguiente", async () => {
    const s = await fullStudio();
    const ana = await book(s, visitor("Ana"));
    const first = await joined(s, visitor("Laura"), s.catalog.packages.basicoBodyCombat);
    const second = await joined(s, visitor("Marta"));
    // El plan que eligio Laura ya no se vende en la pagina.
    await call(packageRoute.PUT, { token: s.token, method: "PUT", params: { id: s.catalog.packages.basicoBodyCombat }, body: { visiblePublico: false } });

    expectOk(await cancelPublic(ana.accessToken));
    assert.equal((await entryOf(first.accessToken)).estado, "EN_ESPERA");
    assert.equal((await entryOf(second.accessToken)).estado, "ASIGNADA");
  });

  test("pasado el plazo de cancelación no asigna solo; Dar cupo sí", async () => {
    const s = await fullStudio();
    const ana = await book(s, visitor("Ana"));
    const laura = await joined(s, visitor("Laura"));
    await call(profileRoute.PUT, { token: s.token, method: "PUT", body: { horasCancelacion: 168 } });

    const anaBooking = await prisma.booking.findUniqueOrThrow({ where: { accessToken: ana.accessToken } });
    expectOk(await call(bookingRoute.PUT, { token: s.token, method: "PUT", params: { id: anaBooking.id }, body: { cancelar: true } }));
    const entry = await entryOf(laura.accessToken);
    assert.equal(entry.estado, "EN_ESPERA");
    const free = await prisma.notification.findFirst({ where: { clientId: s.client.id, type: "STUDIO_WAITLIST_FREE" } });
    assert.match(free?.title ?? "", /Se liberó un cupo/);

    const list = expectOk<Array<{ id: string; posicion: number; plan: string | null }>>(
      await call(waitlistRoute.GET, { token: s.token, path: `/?scheduleId=${s.scheduleId}&fecha=${s.fecha}` })
    );
    assert.equal(list.length, 1);
    assert.equal(list[0].posicion, 1);
    assert.equal(list[0].plan, "Individual");

    const booking = expectOk<{ estado: string; origen: string }>(
      await call(assignRoute.POST, { token: s.token, method: "POST", params: { id: entry.id } }),
      201
    );
    assert.equal(booking.estado, "RESERVADA");
    assert.equal((await entryOf(laura.accessToken)).estado, "ASIGNADA");
    expectError(await call(assignRoute.POST, { token: s.token, method: "POST", params: { id: entry.id } }), 409);
  });

  test("Dar cupo sin cupo libre se rechaza", async () => {
    const s = await fullStudio();
    await book(s, visitor("Ana"));
    const laura = await joined(s, visitor("Laura"));
    const entry = await entryOf(laura.accessToken);
    expectError(await call(assignRoute.POST, { token: s.token, method: "POST", params: { id: entry.id } }), 409, /Sin cupos/);
  });

  test("subir el cupo de la clase deja entrar a la lista", async () => {
    const s = await fullStudio();
    await book(s, visitor("Ana"));
    const laura = await joined(s, visitor("Laura"));
    expectOk(await call(sessionsRoute.PUT, { token: s.token, method: "PUT", body: { scheduleId: s.scheduleId, fecha: s.fecha, cupo: 2 } }));
    assert.equal((await entryOf(laura.accessToken)).estado, "ASIGNADA");
  });

  test("quien sale de la lista ya no recibe cupo", async () => {
    const s = await fullStudio();
    const ana = await book(s, visitor("Ana"));
    const laura = await joined(s, visitor("Laura"));

    const left = expectOk<{ estado: string }>(
      await call(publicWaitlistRoute.PUT, { token: "", method: "PUT", params: { token: laura.accessToken }, body: { salir: true } })
    );
    assert.equal(left.estado, "SALIO");
    expectError(await call(publicWaitlistRoute.PUT, { token: "", method: "PUT", params: { token: laura.accessToken }, body: { salir: true } }), 409);

    expectOk(await cancelPublic(ana.accessToken));
    assert.equal((await entryOf(laura.accessToken)).estado, "SALIO");
    assert.equal(await prisma.booking.count({ where: { sessionId: (await entryOf(laura.accessToken)).sessionId, estado: "RESERVADA" } }), 0);
  });

  test("quien reserva por otro camino sale de la lista", async () => {
    const s = await fullStudio();
    const ana = await book(s, visitor("Ana"));
    const laura = visitor("Laura");
    const entry = await joined(s, laura);
    // La dueña sube el cupo pero pasado el plazo: no se asigna sola y Laura reserva por la web.
    await call(profileRoute.PUT, { token: s.token, method: "PUT", body: { horasCancelacion: 168 } });
    expectOk(await cancelPublic(ana.accessToken));
    await book(s, laura);
    assert.equal((await entryOf(entry.accessToken)).estado, "ASIGNADA");
  });
});

describe("spec 015 · aislamiento", () => {
  test("otro negocio no ve ni maneja la lista", async () => {
    const s = await fullStudio();
    await book(s, visitor("Ana"));
    const laura = await joined(s, visitor("Laura"));
    const entry = await entryOf(laura.accessToken);
    const other = await createBusiness();

    const list = expectOk<unknown[]>(await call(waitlistRoute.GET, { token: other.token, path: `/?scheduleId=${s.scheduleId}&fecha=${s.fecha}` }));
    assert.equal(list.length, 0);
    expectError(await call(assignRoute.POST, { token: other.token, method: "POST", params: { id: entry.id } }), 404);
    expectError(await call(waitlistEntryRoute.DELETE, { token: other.token, method: "DELETE", params: { id: entry.id } }), 404);
    assert.equal((await entryOf(laura.accessToken)).estado, "EN_ESPERA");

    // La dueña si puede quitarla.
    const removed = await call(waitlistEntryRoute.DELETE, { token: s.token, method: "DELETE", params: { id: entry.id } });
    assert.equal(removed.status, 204);
    assert.equal((await entryOf(laura.accessToken)).estado, "SALIO");
  });
});
