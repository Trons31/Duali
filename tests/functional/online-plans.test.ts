// Spec 021: comprar un plan en linea, Mi plan, reservar con el plan y validar el pago.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as accessLinkRoute from "@/app/api/member-packages/[id]/access-link/route";
import * as approveRoute from "@/app/api/payment-receipts/[id]/approve/route";
import * as rejectRoute from "@/app/api/payment-receipts/[id]/reject/route";
import * as profileRoute from "@/app/api/client/profile/route";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as packageRoute from "@/app/api/packages/[id]/route";
import * as planRoute from "@/app/api/public/plans/[token]/route";
import * as planReceiptsRoute from "@/app/api/public/plans/[token]/receipts/route";
import * as purchaseRoute from "@/app/api/public/studios/[slug]/plans/route";
import * as publicBookingsRoute from "@/app/api/public/studios/[slug]/bookings/route";
import { offlineDeletions } from "@/lib/cloudinary";
import { isoWeekday, studioNow } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, createSchedule, nextDate, sell } from "./studio-fixtures";

after(disconnect);

// Una "foto" valida para el validador (tipo y tamano); la subida es offline en pruebas.
const PHOTO = `data:image/png;base64,iVBORw0KGgo${"A".repeat(400)}`;
const receipt = (metodo = "Nequi") => ({ tipo: "COMPROBANTE", comprobante: PHOTO, metodo });

let counter = 0;
let phone = 3_100_000_000;

async function studio(settings: Record<string, unknown> = {}, options: { cupo?: number } = {}) {
  const business = await createBusiness();
  const catalog = await createCatalog(business.token);
  const schedules = await createSchedule(business.token, catalog.disciplines.bodyCombat, [1, 2, 3, 4, 5, 6, 7], { cupo: options.cupo ?? 10 });
  counter += 1;
  const slug = `compra-${Date.now()}-${counter}`;
  expectOk(await call(publicPageRoute.PUT, { token: business.token, method: "PUT", body: { slug, paginaPublicaActiva: true } }));
  expectOk(
    await call(profileRoute.PUT, {
      token: business.token,
      method: "PUT",
      body: { paymentMethodItems: [{ name: "Nequi", account: "300 123 4567" }, { name: "Bancolombia", account: "Ahorros 123" }], ...settings }
    })
  );
  const fecha = nextDate(1);
  const scheduleId = schedules.find((item) => item.diaSemana === isoWeekday(fecha))!.id;
  return { ...business, catalog, slug, fecha, scheduleId };
}

function person(nombre = "Valentina") {
  phone += 1;
  return { celular: String(phone), nombre };
}

type Purchase = { accessToken: string; plan: { situacionPago: string; clasesRestantes: number; puedeReservar: boolean } };

function buy(slug: string, body: Record<string, unknown>) {
  return call<Purchase>(purchaseRoute.POST, { token: "", method: "POST", params: { slug }, body });
}

function book(slug: string, body: Record<string, unknown>) {
  return call(publicBookingsRoute.POST, { token: "", method: "POST", params: { slug }, body });
}

function plan(token: string) {
  return call(planRoute.GET, { token: "", params: { token } });
}

describe("spec 021 · comprar un plan en línea", () => {
  test("con comprobante: venta en línea desde hoy, comprobante por revisar y enlace Mi plan", async () => {
    const s = await studio();
    const who = person();
    const result = expectOk(await buy(s.slug, { packageId: s.catalog.packages.basicoBodyCombat, ...who, pago: receipt("Bancolombia") }), 201);
    assert.equal(result.plan.situacionPago, "EN_REVISION");
    assert.equal(result.plan.clasesRestantes, 4);
    assert.equal(result.plan.puedeReservar, true, "D3: reserva mientras se valida");

    const sale = await prisma.memberPackage.findUniqueOrThrow({ where: { accessToken: result.accessToken }, include: { receipts: true, member: true } });
    assert.equal(sale.origen, "PUBLICO");
    assert.equal(sale.inicio.toISOString().slice(0, 10), studioNow().dateKey, "D6: empieza el día de la compra");
    assert.equal(Number(sale.pagado), 0);
    assert.equal(sale.receipts.length, 1);
    assert.equal(sale.receipts[0].metodoPago, "Bancolombia");
    assert.equal(sale.member.nombre, "Valentina");
  });

  test("sin comprobante no se compra, salvo con «Permitir pagar en el estudio»", async () => {
    const s = await studio();
    expectError(await buy(s.slug, { packageId: s.catalog.packages.basicoBodyCombat, ...person() }), 422);
    expectError(await buy(s.slug, { packageId: s.catalog.packages.basicoBodyCombat, ...person(), pago: { tipo: "EN_ESTUDIO" } }), 422, /comprobante/);

    const flexible = await studio({ permitirPagoEnEstudio: true });
    const result = expectOk(
      await buy(flexible.slug, { packageId: flexible.catalog.packages.basicoBodyCombat, ...person(), pago: { tipo: "EN_ESTUDIO" } }),
      201
    );
    assert.equal(result.plan.situacionPago, "PAGO_EN_ESTUDIO");
  });

  test("rechaza fotos que no sirven y métodos que no son del estudio", async () => {
    const s = await studio();
    const body = { packageId: s.catalog.packages.basicoBodyCombat, ...person() };
    expectError(await buy(s.slug, { ...body, pago: { ...receipt(), comprobante: "data:image/gif;base64,R0lGODlh" + "A".repeat(400) } }), 422, /JPG/);
    expectError(await buy(s.slug, { ...body, pago: { ...receipt(), comprobante: "hola" } }), 422);
    expectError(await buy(s.slug, { ...body, pago: receipt("Daviplata") }), 422, /métodos/);
    assert.equal(await prisma.memberPackage.count({ where: { clientId: s.client.id } }), 0);
  });

  test("mismo celular con otro nombre o plan oculto: no se vende nada", async () => {
    const s = await studio();
    const who = person("Laura");
    expectOk(await buy(s.slug, { packageId: s.catalog.packages.basicoBodyCombat, ...who, pago: receipt() }), 201);
    expectError(await buy(s.slug, { packageId: s.catalog.packages.basicoBodyCombat, celular: who.celular, nombre: "Camila", pago: receipt() }), 409);

    expectOk(await call(packageRoute.PUT, { token: s.token, method: "PUT", params: { id: s.catalog.packages.basicoRumba }, body: { visiblePublico: false } }));
    expectError(await buy(s.slug, { packageId: s.catalog.packages.basicoRumba, ...person(), pago: receipt() }), 404);
    assert.equal(await prisma.memberPackage.count({ where: { clientId: s.client.id } }), 1);
  });

  test("D7: la tercera compra sin pago aprobado del mismo celular se rechaza", async () => {
    const s = await studio();
    const who = person();
    const body = { packageId: s.catalog.packages.basicoBodyCombat, ...who, pago: receipt() };
    expectOk(await buy(s.slug, body), 201);
    expectOk(await buy(s.slug, body), 201);
    expectError(await buy(s.slug, body), 409, /esperando/);
  });
});

describe("spec 021 · Mi plan", () => {
  test("muestra uso, pago y comprobantes; un token inventado da 404", async () => {
    const s = await studio();
    const { accessToken } = expectOk(await buy(s.slug, { packageId: s.catalog.packages.basicoMix, ...person(), pago: receipt() }), 201);
    const view = expectOk<{ clases: number; clasesRestantes: number; situacionPago: string; comprobantes: unknown[]; incluye: string[] }>(
      await plan(accessToken)
    );
    assert.equal(view.clases, 4);
    assert.equal(view.situacionPago, "EN_REVISION");
    assert.equal(view.comprobantes.length, 1);
    assert.ok(view.incluye.includes("Body Combat"));
    expectError(await plan("token-que-no-existe-123"), 404);
  });

  test("aprobar deja el plan Pagado; rechazar muestra el motivo y deja subir otro", async () => {
    const s = await studio();
    const first = expectOk(await buy(s.slug, { packageId: s.catalog.packages.basicoBodyCombat, ...person(), pago: receipt() }), 201);
    const firstReceipt = await prisma.paymentReceipt.findFirstOrThrow({ where: { memberPackage: { accessToken: first.accessToken } } });
    expectOk(await call(approveRoute.POST, { token: s.token, method: "POST", params: { id: firstReceipt.id }, body: { monto: 55000, metodoPago: "NEQUI" } }));
    assert.equal(expectOk<{ situacionPago: string }>(await plan(first.accessToken)).situacionPago, "PAGADO");

    const second = expectOk(await buy(s.slug, { packageId: s.catalog.packages.basicoBodyCombat, ...person("Bea"), pago: receipt() }), 201);
    const secondReceipt = await prisma.paymentReceipt.findFirstOrThrow({ where: { memberPackage: { accessToken: second.accessToken } } });
    expectOk(await call(rejectRoute.POST, { token: s.token, method: "POST", params: { id: secondReceipt.id }, body: { motivo: "No se ve el monto" } }));
    const rejected = expectOk<{ situacionPago: string; comprobantes: Array<{ motivoRechazo: string | null }> }>(await plan(second.accessToken));
    assert.equal(rejected.situacionPago, "RECHAZADO");
    assert.equal(rejected.comprobantes[0].motivoRechazo, "No se ve el monto");

    const again = expectOk<{ situacionPago: string }>(
      await call(planReceiptsRoute.POST, { token: "", method: "POST", params: { token: second.accessToken }, body: { comprobante: PHOTO, metodo: "Nequi" } }),
      201
    );
    assert.equal(again.situacionPago, "EN_REVISION");
  });

  test("la dueña obtiene el enlace de cualquier plan; otro negocio no", async () => {
    const s = await studio();
    const member = await createMember(s.token, "Ana");
    const saleId = (await sell(s.token, member.id, s.catalog.packages.basicoBodyCombat)).id;

    const link = expectOk<{ accessToken: string }>(await call(accessLinkRoute.POST, { token: s.token, method: "POST", params: { id: saleId } }));
    const again = expectOk<{ accessToken: string }>(await call(accessLinkRoute.POST, { token: s.token, method: "POST", params: { id: saleId } }));
    assert.equal(link.accessToken, again.accessToken);
    const other = await createBusiness();
    expectError(await call(accessLinkRoute.POST, { token: other.token, method: "POST", params: { id: saleId } }), 404);
  });
});

describe("spec 021 · reservar con el plan", () => {
  test("vista previa sin efectos y reserva desde Mi plan sin pedir datos", async () => {
    const s = await studio();
    const who = person();
    const { accessToken } = expectOk(await buy(s.slug, { packageId: s.catalog.packages.basicoBodyCombat, ...who, pago: receipt() }), 201);

    const preview = expectOk<{ estado: string; plan: { clasesRestantes: number; clases: number } }>(
      await book(s.slug, { scheduleId: s.scheduleId, fecha: s.fecha, ...who, vistaPrevia: true })
    );
    assert.equal(preview.estado, "VISTA_PREVIA");
    assert.deepEqual([preview.plan.clasesRestantes, preview.plan.clases], [4, 4]);
    assert.equal(await prisma.booking.count({ where: { clientId: s.client.id } }), 0);

    const booked = expectOk<{ paquete: { clasesRestantes: number; miPlan: string } }>(
      await book(s.slug, { scheduleId: s.scheduleId, fecha: s.fecha, planToken: accessToken }),
      201
    );
    assert.equal(booked.paquete.clasesRestantes, 3);
    assert.equal(booked.paquete.miPlan, accessToken);
    const view = expectOk<{ proximas: unknown[] }>(await plan(accessToken));
    assert.equal(view.proximas.length, 1);
  });

  test("con «Esperar a validar el pago», el plan en revisión no reserva hasta aprobarlo", async () => {
    const s = await studio({ exigirPagoValidado: true });
    const who = person();
    const { accessToken } = expectOk(await buy(s.slug, { packageId: s.catalog.packages.basicoBodyCombat, ...who, pago: receipt() }), 201);
    assert.equal(expectOk<{ puedeReservar: boolean }>(await plan(accessToken)).puedeReservar, false);
    expectError(await book(s.slug, { scheduleId: s.scheduleId, fecha: s.fecha, planToken: accessToken }), 409, /revisión/);
    expectError(await book(s.slug, { scheduleId: s.scheduleId, fecha: s.fecha, ...who }), 409, /revisión/);

    const pending = await prisma.paymentReceipt.findFirstOrThrow({ where: { memberPackage: { accessToken } } });
    expectOk(await call(approveRoute.POST, { token: s.token, method: "POST", params: { id: pending.id }, body: { monto: 55000, metodoPago: "NEQUI" } }));
    expectOk(await book(s.slug, { scheduleId: s.scheduleId, fecha: s.fecha, planToken: accessToken }), 201);
  });

  test("sin plan: compra y reserva juntas con el comprobante; sin pago no", async () => {
    const s = await studio();
    const who = person();
    const base = { scheduleId: s.scheduleId, fecha: s.fecha, ...who, packageId: s.catalog.packages.individualBodyCombat };
    const needs = expectOk<{ estado: string; exigePagoValidado: boolean }>(await book(s.slug, { scheduleId: s.scheduleId, fecha: s.fecha, ...who }));
    assert.equal(needs.estado, "NECESITA_PAQUETE");
    assert.equal(needs.exigePagoValidado, false);
    expectError(await book(s.slug, base), 422);

    const booked = expectOk<{ paquete: { miPlan: string; situacionPago: string } }>(await book(s.slug, { ...base, pago: receipt() }), 201);
    assert.equal(booked.paquete.situacionPago, "EN_REVISION");
    const sale = await prisma.memberPackage.findUniqueOrThrow({ where: { accessToken: booked.paquete.miPlan }, include: { receipts: true } });
    assert.equal(sale.origen, "PUBLICO");
    assert.ok(sale.receipts[0].bookingId, "el comprobante queda con su reserva");
  });

  test("si la reserva falla después de subir la foto, la foto se borra", async () => {
    const s = await studio({}, { cupo: 1 });
    expectOk(
      await book(s.slug, { scheduleId: s.scheduleId, fecha: s.fecha, ...person("Ana"), packageId: s.catalog.packages.individualBodyCombat, pago: receipt() }),
      201
    );
    const before = offlineDeletions.length;
    // Un cupo mas, que toma Bea; Cata llega con la clase llena: la reserva falla despues de subir la foto.
    await prisma.classSession.updateMany({ where: { scheduleId: s.scheduleId }, data: { cupo: 2 } });
    const blocker = person("Bea");
    expectOk(
      await book(s.slug, { scheduleId: s.scheduleId, fecha: s.fecha, ...blocker, packageId: s.catalog.packages.individualBodyCombat, pago: receipt() }),
      201
    );
    const result = await book(s.slug, { scheduleId: s.scheduleId, fecha: s.fecha, ...person("Cata"), packageId: s.catalog.packages.individualBodyCombat, pago: receipt() });
    assert.equal(result.status, 409);
    assert.ok(offlineDeletions.length > before, "la foto subida se borró");
    assert.equal(await prisma.paymentReceipt.count({ where: { clientId: s.client.id } }), 2);
  });
});
