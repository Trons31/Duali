// Specs 008 y 009: pagina publica del estudio y reserva web sin sesion.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as profileRoute from "@/app/api/client/profile/route";
import * as packageRoute from "@/app/api/packages/[id]/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import * as publicBookingsRoute from "@/app/api/public/studios/[slug]/bookings/route";
import * as publicBookingRoute from "@/app/api/public/bookings/[token]/route";
import { createPublicBooking, getPublicCatalog, getPublicSchedule, getPublishedStudio } from "@/lib/public-studio";
import { addDaysToKey, isoWeekday, studioNow } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, createSchedule, nextDate, sell } from "./studio-fixtures";

after(disconnect);

let slugCounter = 0;

async function publishedStudio() {
  const business = await createBusiness();
  const catalog = await createCatalog(business.token);
  const schedules = await createSchedule(business.token, catalog.disciplines.bodyCombat, [1, 2, 3, 4, 5, 6, 7], { cupo: 3 });
  const schedule = schedules.find((item) => item.diaSemana === 1)!;
  slugCounter += 1;
  const slug = `estudio-prueba-${Date.now()}-${slugCounter}`;
  expectOk(
    await call(publicPageRoute.PUT, { token: business.token, method: "PUT", body: { slug, paginaPublicaActiva: true } })
  );
  // Spec 021 D2: como antes, se vende por la web sin pagar.
  await prisma.client.updateMany({ where: { slug }, data: { permitirPagoEnEstudio: true } });
  const scheduleFor = (fecha: string) => schedules.find((item) => item.diaSemana === isoWeekday(fecha))!.id;
  return { ...business, catalog, slug, scheduleId: schedule.id, fecha: nextDate(1), scheduleFor };
}

// Las rutas publicas no llevan token: se llaman sin sesion.
function publicBook(slug: string, body: Record<string, unknown>) {
  const withPayment = body.packageId && !body.pago ? { ...body, pago: { tipo: "EN_ESTUDIO" } } : body;
  return call(publicBookingsRoute.POST, { token: "", method: "POST", params: { slug }, body: withPayment });
}

describe("spec 008 · dirección y publicación", () => {
  test("sugiere una dirección a partir del nombre y valida el formato", async () => {
    const { token } = await createBusiness();
    const state = expectOk<{ slug: string | null; sugerido: string; paginaPublicaActiva: boolean }>(
      await call(publicPageRoute.GET, { token })
    );
    assert.equal(state.slug, null);
    assert.equal(state.paginaPublicaActiva, false);
    assert.match(state.sugerido, /^estudio-\d+/);

    expectError(await call(publicPageRoute.PUT, { token, method: "PUT", body: { slug: "admin" } }), 422);
    expectError(await call(publicPageRoute.PUT, { token, method: "PUT", body: { slug: "Mi Estudio!" } }), 422);
  });

  test("dos negocios no comparten dirección; las mayúsculas cuentan igual", async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    const slug = `compartida-${Date.now()}`;
    expectOk(await call(publicPageRoute.PUT, { token: a.token, method: "PUT", body: { slug } }));
    expectError(await call(publicPageRoute.PUT, { token: b.token, method: "PUT", body: { slug: slug.toUpperCase() } }), 409);
  });

  test("para publicar hace falta dirección y módulo Estudio", async () => {
    const noSlug = await createBusiness();
    expectError(await call(publicPageRoute.PUT, { token: noSlug.token, method: "PUT", body: { paginaPublicaActiva: true } }), 422, /dirección/);

    const academia = await createBusiness({ moduloEstudio: false });
    expectError(
      await call(publicPageRoute.PUT, {
        token: academia.token,
        method: "PUT",
        body: { slug: `academia-${Date.now()}`, paginaPublicaActiva: true }
      }),
      422,
      /Estudio/
    );
  });

  test("sin publicar no existe; despublicar o apagar el módulo la oculta de nuevo", async () => {
    const studio = await publishedStudio();
    assert.ok(await getPublishedStudio(studio.slug));

    await call(publicPageRoute.PUT, { token: studio.token, method: "PUT", body: { paginaPublicaActiva: false } });
    assert.equal(await getPublishedStudio(studio.slug), null);

    await call(publicPageRoute.PUT, { token: studio.token, method: "PUT", body: { paginaPublicaActiva: true } });
    await call(profileRoute.PUT, { token: studio.token, method: "PUT", body: { moduloEstudio: false } });
    assert.equal(await getPublishedStudio(studio.slug), null);
  });
});

describe("spec 008 · contenido de la página", () => {
  test("precios: solo paquetes activos y visibles", async () => {
    const studio = await publishedStudio();
    await call(packageRoute.PUT, { token: studio.token, method: "PUT", params: { id: studio.catalog.packages.basicoJump }, body: { visiblePublico: false } });
    await call(packageRoute.PUT, { token: studio.token, method: "PUT", params: { id: studio.catalog.packages.basicoRumba }, body: { activo: false } });

    const catalog = await getPublicCatalog(studio.client.id);
    const ids = catalog.flatMap((discipline) => discipline.packages.map((item) => item.id));
    assert.ok(ids.includes(studio.catalog.packages.basicoBodyCombat));
    assert.ok(!ids.includes(studio.catalog.packages.basicoJump), "oculto");
    assert.ok(!ids.includes(studio.catalog.packages.basicoRumba), "pausado");
    assert.deepEqual(catalog.find((item) => item.nombre === "Mix Studio")?.incluye.sort(), ["Body Combat", "Jump Power", "Rumba Fit"]);
  });

  test("horario: 7 días con cupos libres y sin datos de quién reservó", async () => {
    const studio = await publishedStudio();
    const member = await createMember(studio.token, "Laura");
    const inTwoDays = addDaysToKey(studioNow().dateKey, 2);
    await sell(studio.token, member.id, studio.catalog.packages.basicoBodyCombat);
    expectOk(
      await call(bookingsRoute.POST, {
        token: studio.token,
        method: "POST",
        body: { scheduleId: studio.scheduleFor(inTwoDays), fecha: inTwoDays, memberId: member.id }
      }),
      201
    );

    const schedule = await getPublicSchedule(studio.client.id);
    const days = new Set(schedule.map((session) => session.fecha));
    assert.ok(days.size >= 6 && days.size <= 7, `días: ${days.size}`);
    const booked = schedule.find((session) => session.fecha === inTwoDays)!;
    assert.equal(booked.cuposLibres, 2);
    assert.equal(JSON.stringify(schedule).includes("Laura"), false);
    assert.equal(JSON.stringify(schedule).includes(member.celular), false);
  });

  test("horario: las clases de hoy que ya empezaron no se muestran", async () => {
    const studio = await publishedStudio();
    // A las 23:59 de Bogota del dia de la clase ya empezaron todas las de las 18:00.
    const today = studioNow().dateKey;
    const lateTonight = new Date(`${today}T23:59:00-05:00`);
    const schedule = await getPublicSchedule(studio.client.id, 7, lateTonight);
    assert.equal(schedule.some((session) => session.fecha === today), false);
  });
});

describe("spec 009 · reserva web", () => {
  test("clienta nueva sin paquete: pide paquete, elige Individual y queda debiendo $15.000", async () => {
    const studio = await publishedStudio();
    const base = { scheduleId: studio.scheduleId, fecha: studio.fecha, celular: "+57 311 555 0101", nombre: "Valentina" };

    const first = expectOk<{ estado: string; opciones: Array<{ id: string; clases: number; precio: number }> }>(
      await publicBook(studio.slug, base)
    );
    assert.equal(first.estado, "NECESITA_PAQUETE");
    assert.ok(first.opciones.some((item) => item.id === studio.catalog.packages.individualBodyCombat));
    assert.equal(await prisma.studioMember.count({ where: { clientId: studio.client.id } }), 0, "aún no crea la ficha");

    const booked = expectOk<{ estado: string; accessToken: string; paquete: { saldo: number; clasesRestantes: number } }>(
      await publicBook(studio.slug, { ...base, packageId: studio.catalog.packages.individualBodyCombat }),
      201
    );
    assert.equal(booked.estado, "RESERVADA");
    assert.equal(booked.paquete.saldo, 15000);
    assert.equal(booked.paquete.clasesRestantes, 0);

    const member = await prisma.studioMember.findFirstOrThrow({ where: { clientId: studio.client.id } });
    assert.equal(member.celular, "3115550101");
    const booking = await prisma.booking.findFirstOrThrow({ where: { memberId: member.id } });
    assert.equal(booking.origen, "PUBLICO");
    assert.equal(booking.accessToken, booked.accessToken);
  });

  test("clienta con Básico vigente reserva y le quedan 3", async () => {
    const studio = await publishedStudio();
    const member = await createMember(studio.token, "Camila");
    await sell(studio.token, member.id, studio.catalog.packages.basicoBodyCombat);
    const booked = expectOk<{ paquete: { clasesRestantes: number; saldo: number } }>(
      await publicBook(studio.slug, { scheduleId: studio.scheduleId, fecha: studio.fecha, celular: member.celular, nombre: "camila" }),
      201
    );
    assert.equal(booked.paquete.clasesRestantes, 3);
  });

  test("mismo celular con otro nombre: 409 y no se descuenta nada", async () => {
    const studio = await publishedStudio();
    const member = await createMember(studio.token, "Camila");
    const sale = await sell(studio.token, member.id, studio.catalog.packages.basicoBodyCombat);
    expectError(
      await publicBook(studio.slug, { scheduleId: studio.scheduleId, fecha: studio.fecha, celular: member.celular, nombre: "Intrusa" }),
      409,
      /otro nombre/
    );
    const stored = await prisma.memberPackage.findUniqueOrThrow({ where: { id: sale.id } });
    assert.equal(stored.clasesUsadas, 0);
  });

  test("página sin publicar o inexistente: 404", async () => {
    const studio = await publishedStudio();
    await call(publicPageRoute.PUT, { token: studio.token, method: "PUT", body: { paginaPublicaActiva: false } });
    const body = { scheduleId: studio.scheduleId, fecha: studio.fecha, celular: "3001110000", nombre: "Ana" };
    expectError(await publicBook(studio.slug, body), 404);
    expectError(await publicBook("no-existe-este-estudio", body), 404);
  });

  test("un paquete oculto no se puede vender por la web", async () => {
    const studio = await publishedStudio();
    await call(packageRoute.PUT, {
      token: studio.token,
      method: "PUT",
      params: { id: studio.catalog.packages.individualBodyCombat },
      body: { visiblePublico: false }
    });
    expectError(
      await publicBook(studio.slug, {
        scheduleId: studio.scheduleId,
        fecha: studio.fecha,
        celular: "3001110001",
        nombre: "Ana",
        packageId: studio.catalog.packages.individualBodyCombat
      }),
      422
    );
    assert.equal(await prisma.memberPackage.count({ where: { clientId: studio.client.id } }), 0);
  });

  test("un horario de otro estudio no se reserva desde esta página", async () => {
    const studio = await publishedStudio();
    const other = await publishedStudio();
    expectError(
      await publicBook(studio.slug, { scheduleId: other.scheduleId, fecha: other.fecha, celular: "3001110002", nombre: "Ana" }),
      404
    );
  });

  test("ventana de reserva: no antes de hoy ni más de 14 días adelante", async () => {
    const studio = await publishedStudio();
    const today = studioNow().dateKey;
    const body = { scheduleId: studio.scheduleId, celular: "3001110003", nombre: "Ana" };
    expectError(await publicBook(studio.slug, { ...body, fecha: addDaysToKey(today, -1) }), 422);
    expectError(await publicBook(studio.slug, { ...body, fecha: addDaysToKey(today, 14) }), 422);
  });

  test("clase llena: no entra nadie más", async () => {
    const studio = await publishedStudio();
    for (const [index, nombre] of ["Uno", "Dos", "Tres"].entries()) {
      expectOk(
        await publicBook(studio.slug, {
          scheduleId: studio.scheduleId,
          fecha: studio.fecha,
          celular: `30022200${index}0`,
          nombre,
          packageId: studio.catalog.packages.individualBodyCombat
        }),
        201
      );
    }
    expectError(
      await publicBook(studio.slug, {
        scheduleId: studio.scheduleId,
        fecha: studio.fecha,
        celular: "3002220099",
        nombre: "Cuatro",
        packageId: studio.catalog.packages.individualBodyCombat
      }),
      409,
      /Sin cupos/
    );
  });

  test("una clase cancelada por el estudio no se reserva", async () => {
    const studio = await publishedStudio();
    await call(sessionsRoute.PUT, {
      token: studio.token,
      method: "PUT",
      body: { scheduleId: studio.scheduleId, fecha: studio.fecha, cancelada: true }
    });
    expectError(
      await publicBook(studio.slug, {
        scheduleId: studio.scheduleId,
        fecha: studio.fecha,
        celular: "3001110004",
        nombre: "Ana",
        packageId: studio.catalog.packages.individualBodyCombat
      }),
      409,
      /cancelada/
    );
  });

  test("una clase de hoy que ya empezó no se reserva por la web", async () => {
    const studio = await publishedStudio();
    const today = studioNow().dateKey;
    const lateTonight = new Date(`${today}T23:59:00-05:00`);
    await assert.rejects(
      createPublicBooking(
        studio.slug,
        {
          scheduleId: studio.scheduleFor(today),
          fecha: today,
          celular: "3001110006",
          nombre: "Ana",
          packageId: studio.catalog.packages.individualBodyCombat,
          pago: { tipo: "EN_ESTUDIO" }
        },
        lateTonight
      ),
      /ya empezó/
    );
    // Y a primera hora del mismo día sí se puede.
    const earlyMorning = new Date(`${today}T06:00:00-05:00`);
    const result = await createPublicBooking(
      studio.slug,
      {
        scheduleId: studio.scheduleFor(today),
        fecha: today,
        celular: "3001110007",
        nombre: "Ana",
        packageId: studio.catalog.packages.individualBodyCombat,
        pago: { tipo: "EN_ESTUDIO" }
      },
      earlyMorning
    );
    assert.equal(result.estado, "RESERVADA");
  });

  test("la fecha debe caer en el día del horario", async () => {
    const studio = await publishedStudio();
    const [mondayOnly] = await createSchedule(studio.token, studio.catalog.disciplines.jump, [1]);
    let tuesday = nextDate(2);
    if (isoWeekday(tuesday) === 1) tuesday = addDaysToKey(tuesday, 1);
    expectError(
      await publicBook(studio.slug, { scheduleId: mondayOnly.id, fecha: tuesday, celular: "3001110005", nombre: "Ana", packageId: studio.catalog.packages.basicoJump }),
      422
    );
  });
});

describe("spec 009 · enlace privado de la reserva", () => {
  async function bookedWithToken() {
    const studio = await publishedStudio();
    const result = expectOk<{ accessToken: string }>(
      await publicBook(studio.slug, {
        scheduleId: studio.scheduleId,
        fecha: studio.fecha,
        celular: "3004440000",
        nombre: "Paula",
        packageId: studio.catalog.packages.individualBodyCombat
      }),
      201
    );
    return { studio, token: result.accessToken };
  }

  test("muestra la reserva sin datos internos y permite cancelarla", async () => {
    const { studio, token } = await bookedWithToken();
    const view = expectOk<Record<string, unknown> & { estado: string; nombre: string; saldo: number }>(
      await call(publicBookingRoute.GET, { token: "", params: { token } })
    );
    assert.equal(view.estado, "RESERVADA");
    assert.equal(view.nombre, "Paula");
    assert.equal(view.saldo, 15000);
    assert.equal("clientId" in view, false);
    assert.equal(JSON.stringify(view).includes("3004440000"), false, "no expone el celular");

    await call(profileRoute.PUT, { token: studio.token, method: "PUT", body: { horasCancelacion: 0 } });
    const cancelled = expectOk<{ estado: string; claseDevuelta: boolean }>(
      await call(publicBookingRoute.PUT, { token: "", method: "PUT", params: { token }, body: { cancelar: true } })
    );
    assert.equal(cancelled.estado, "CANCELADA");
    assert.equal(cancelled.claseDevuelta, true);
    expectError(await call(publicBookingRoute.PUT, { token: "", method: "PUT", params: { token }, body: { cancelar: true } }), 409);
  });

  test("fuera de plazo se cancela pero la clase no vuelve (sin excepción desde la web)", async () => {
    const { studio, token } = await bookedWithToken();
    await call(profileRoute.PUT, { token: studio.token, method: "PUT", body: { horasCancelacion: 168 } });
    const cancelled = expectOk<{ claseDevuelta: boolean }>(
      await call(publicBookingRoute.PUT, { token: "", method: "PUT", params: { token }, body: { cancelar: true } })
    );
    assert.equal(cancelled.claseDevuelta, false);
  });

  test("un token inventado da 404", async () => {
    expectError(await call(publicBookingRoute.GET, { token: "", params: { token: "token-inventado" } }), 404);
    expectError(
      await call(publicBookingRoute.PUT, { token: "", method: "PUT", params: { token: "token-inventado" }, body: { cancelar: true } }),
      404
    );
  });
});
