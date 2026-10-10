// Spec 011: push a la dueña, resumen diario y avisos por WhatsApp.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as cronRoute from "@/app/api/cron/payment-reminders/route";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import * as publicBookingsRoute from "@/app/api/public/studios/[slug]/bookings/route";
import * as publicBookingRoute from "@/app/api/public/bookings/[token]/route";
import * as remindersRoute from "@/app/api/studio-reminders/route";
import * as sentRoute from "@/app/api/studio-reminders/sent/route";
import { queueStudioDigests } from "@/lib/studio-notifications";
import { addDaysToKey, isoWeekday, studioNow } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, createSchedule, sell } from "./studio-fixtures";

after(disconnect);

type Reminder = { tipo: string; refKey: string; member: { id: string; nombre: string }; mensaje: string; href: string; enviadoAt: string | null };
type Reminders = { manana: Reminder[]; porVencer: Reminder[]; saldos: Reminder[] };

let counter = 0;

async function studio() {
  const business = await createBusiness();
  const catalog = await createCatalog(business.token);
  const schedules = await createSchedule(business.token, catalog.disciplines.bodyCombat, [1, 2, 3, 4, 5, 6, 7], { cupo: 10 });
  counter += 1;
  const slug = `avisos-${Date.now()}-${counter}`;
  expectOk(await call(publicPageRoute.PUT, { token: business.token, method: "PUT", body: { slug, paginaPublicaActiva: true } }));
  const scheduleFor = (fecha: string) => schedules.find((item) => item.diaSemana === isoWeekday(fecha))!.id;
  return { ...business, catalog, slug, scheduleFor };
}

const notificationsOf = (clientId: string, type: string) => prisma.notification.findMany({ where: { clientId, type } });

describe("spec 011 · push a la dueña", () => {
  test("una reserva web avisa a la dueña con enlace a la ficha; una del panel no", async () => {
    const s = await studio();
    const fecha = addDaysToKey(studioNow().dateKey, 2);

    const web = expectOk<{ accessToken: string }>(
      await call(publicBookingsRoute.POST, {
        token: "",
        method: "POST",
        params: { slug: s.slug },
        body: { scheduleId: s.scheduleFor(fecha), fecha, celular: "3115559901", nombre: "Valentina", packageId: s.catalog.packages.individualBodyCombat }
      }),
      201
    );
    const [push] = await notificationsOf(s.client.id, "STUDIO_BOOKING");
    assert.ok(push, "encola el push");
    assert.equal(push.title, "Valentina apartó cupo");
    assert.match(push.body, /Body Combat .* debe \$15\.000/);
    const member = await prisma.studioMember.findFirstOrThrow({ where: { clientId: s.client.id, celular: "3115559901" } });
    assert.equal((push.data as { href: string }).href, `/dashboard/clientes/${member.id}`);
    assert.ok(await prisma.notificationOutbox.findUnique({ where: { notificationId: push.id } }), "queda en la cola de envío");

    const panelMember = await createMember(s.token, "Camila");
    await sell(s.token, panelMember.id, s.catalog.packages.basicoBodyCombat);
    expectOk(await call(bookingsRoute.POST, { token: s.token, method: "POST", body: { scheduleId: s.scheduleFor(fecha), fecha, memberId: panelMember.id } }), 201);
    assert.equal((await notificationsOf(s.client.id, "STUDIO_BOOKING")).length, 1, "la del panel no avisa");

    expectOk(await call(publicBookingRoute.PUT, { token: "", method: "PUT", params: { token: web.accessToken }, body: { cancelar: true } }));
    const [cancelPush] = await notificationsOf(s.client.id, "STUDIO_BOOKING_CANCELLED");
    assert.equal(cancelPush?.title, "Valentina canceló");
  });
});

describe("spec 011 · resumen del día", () => {
  const morning = () => new Date(`${studioNow().dateKey}T08:00:00-05:00`);
  const dawn = () => new Date(`${studioNow().dateKey}T05:30:00-05:00`);

  test("antes de las 6:00 de Bogotá no se encola", async () => {
    const s = await studio();
    const result = await queueStudioDigests({ instant: dawn(), clientIds: [s.client.id] });
    assert.equal(result.queued, 0);
    assert.equal((await notificationsOf(s.client.id, "STUDIO_DIGEST")).length, 0);
  });

  test("se encola una sola vez aunque el cron corra muchas veces", async () => {
    const s = await studio();
    const member = await createMember(s.token, "Laura");
    await sell(s.token, member.id, s.catalog.packages.basicoBodyCombat, { pago: { monto: 30000, metodoPago: "NEQUI" } });

    const first = await queueStudioDigests({ instant: morning(), clientIds: [s.client.id] });
    assert.equal(first.queued, 1);
    for (let run = 0; run < 5; run += 1) await queueStudioDigests({ instant: morning(), clientIds: [s.client.id] });

    const digests = await notificationsOf(s.client.id, "STUDIO_DIGEST");
    assert.equal(digests.length, 1);
    assert.match(digests[0].body, /^Hoy: 1 clase y 0 reservas · \$25\.000 por cobrar$/);
  });

  test("un negocio sin clases ni pendientes no recibe resumen", async () => {
    const empty = await createBusiness();
    const result = await queueStudioDigests({ instant: morning(), clientIds: [empty.client.id] });
    assert.equal(result.skipped, 1);
  });

  test("el cron de siempre sigue funcionando e incluye el resumen", async () => {
    const unauthorized = await cronRoute.GET(new Request("http://localhost/api/cron/payment-reminders?process=false"));
    assert.equal(unauthorized.status, 401, "sin secreto no corre");
    const response = await cronRoute.GET(
      new Request("http://localhost/api/cron/payment-reminders?process=false", { headers: { "x-cron-secret": "cron-de-pruebas" } })
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok("reminders" in body.data);
    assert.ok("studioDigests" in body.data);
  });
});

describe("spec 011 · avisos por WhatsApp", () => {
  test("lista reservas de mañana, paquetes por vencer y saldos, con mensaje y enlace", async () => {
    const s = await studio();
    const other = await studio();
    const tomorrow = addDaysToKey(studioNow().dateKey, 1);

    const laura = await createMember(s.token, "Laura");
    // Vendido hace 28 días: vence mañana.
    await sell(s.token, laura.id, s.catalog.packages.basicoBodyCombat, {
      inicio: addDaysToKey(studioNow().dateKey, -28),
      pago: { monto: 30000, metodoPago: "EFECTIVO" }
    });
    expectOk(await call(bookingsRoute.POST, { token: s.token, method: "POST", body: { scheduleId: s.scheduleFor(tomorrow), fecha: tomorrow, memberId: laura.id } }), 201);

    const foreign = await createMember(other.token, "Ajena");
    await sell(other.token, foreign.id, other.catalog.packages.basicoBodyCombat);

    const reminders = expectOk<Reminders>(await call(remindersRoute.GET, { token: s.token }));
    assert.equal(reminders.manana.length, 1);
    assert.match(reminders.manana[0].mensaje, /Hola Laura/);
    assert.match(reminders.manana[0].mensaje, /Body Combat .* a las 6:00 p\. m\./);
    assert.match(reminders.manana[0].mensaje, new RegExp(`/s/${s.slug}`));
    assert.match(reminders.manana[0].href, /^https:\/\/wa\.me\/57\d{10}\?text=/);

    assert.equal(reminders.porVencer.length, 1);
    assert.match(reminders.porVencer[0].mensaje, /Te quedan 3 clases/);
    assert.equal(reminders.saldos.length, 1);
    assert.match(reminders.saldos[0].mensaje, /\$25\.000/);

    const all = JSON.stringify(reminders);
    assert.equal(all.includes("Ajena"), false, "no mezcla negocios");
  });

  test("marcar como enviado lo muestra enviado y no duplica", async () => {
    const s = await studio();
    const member = await createMember(s.token, "Sara");
    await sell(s.token, member.id, s.catalog.packages.basicoBodyCombat);

    const before = expectOk<Reminders>(await call(remindersRoute.GET, { token: s.token }));
    const item = before.saldos[0];
    assert.equal(item.enviadoAt, null);

    for (let i = 0; i < 2; i += 1) {
      expectOk(await call(sentRoute.POST, { token: s.token, method: "POST", body: { tipo: item.tipo, refKey: item.refKey, memberId: item.member.id } }));
    }
    const afterSend = expectOk<Reminders>(await call(remindersRoute.GET, { token: s.token }));
    assert.ok(afterSend.saldos[0].enviadoAt);
    assert.equal(await prisma.studioMessage.count({ where: { clientId: s.client.id } }), 1);

    // Un cliente de otro negocio no se puede marcar.
    const other = await createBusiness();
    const response = await call(sentRoute.POST, { token: other.token, method: "POST", body: { tipo: item.tipo, refKey: item.refKey, memberId: item.member.id } });
    assert.equal(response.status, 404);
  });

  test("clase cancelada: avisos para cada reserva devuelta", async () => {
    const s = await studio();
    const fecha = addDaysToKey(studioNow().dateKey, 3);
    const scheduleId = s.scheduleFor(fecha);
    for (const nombre of ["Ana", "Bea"]) {
      const member = await createMember(s.token, nombre);
      await sell(s.token, member.id, s.catalog.packages.basicoBodyCombat);
      expectOk(await call(bookingsRoute.POST, { token: s.token, method: "POST", body: { scheduleId, fecha, memberId: member.id } }), 201);
    }
    await call(sessionsRoute.PUT, { token: s.token, method: "PUT", body: { scheduleId, fecha, cancelada: true, motivoCancelacion: "festivo" } });

    const items = expectOk<Reminder[]>(await call(remindersRoute.GET, { token: s.token, path: `/api/studio-reminders?scheduleId=${scheduleId}&fecha=${fecha}` }));
    assert.deepEqual(items.map((item) => item.member.nombre).sort(), ["Ana", "Bea"]);
    assert.match(items[0].mensaje, /se canceló \(festivo\)/);
    assert.equal(items[0].tipo, "CLASE_CANCELADA");
  });
});
