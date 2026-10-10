// Spec 014: comprobantes de pago enviados desde la reserva web.
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as publicBookingsRoute from "@/app/api/public/studios/[slug]/bookings/route";
import * as publicBookingRoute from "@/app/api/public/bookings/[token]/route";
import * as signatureRoute from "@/app/api/public/bookings/[token]/receipt-signature/route";
import * as attachRoute from "@/app/api/public/bookings/[token]/receipts/route";
import * as receiptsRoute from "@/app/api/payment-receipts/route";
import * as approveRoute from "@/app/api/payment-receipts/[id]/approve/route";
import * as rejectRoute from "@/app/api/payment-receipts/[id]/reject/route";
import * as mediaRoute from "@/app/api/media/route";
import { offlineDeletions } from "@/lib/cloudinary";
import { addDaysToKey, isoWeekday, studioNow } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, createSchedule, sell } from "./studio-fixtures";

after(disconnect);
beforeEach(() => {
  offlineDeletions.length = 0;
});

let n = 0;

/** Estudio publicado + una reserva web que queda debiendo $15.000. */
async function webBookingWithBalance() {
  const business = await createBusiness();
  const catalog = await createCatalog(business.token);
  const fecha = addDaysToKey(studioNow().dateKey, 2);
  const [schedule] = await createSchedule(business.token, catalog.disciplines.bodyCombat, [isoWeekday(fecha)]);
  n += 1;
  const slug = `comprobantes-${Date.now()}-${n}`;
  expectOk(await call(publicPageRoute.PUT, { token: business.token, method: "PUT", body: { slug, paginaPublicaActiva: true } }));
  // Spec 021 D2: como antes, se vende por la web sin pagar.
  await prisma.client.updateMany({ where: { slug }, data: { permitirPagoEnEstudio: true } });
  const booked = expectOk<{ accessToken: string }>(
    await call(publicBookingsRoute.POST, {
      token: "",
      method: "POST",
      params: { slug },
      body: { scheduleId: schedule.id, fecha, celular: `31188800${n.toString().padStart(2, "0")}`, nombre: "Laura", packageId: catalog.packages.individualBodyCombat, pago: { tipo: "EN_ESTUDIO" } }
    }),
    201
  );
  return { ...business, catalog, schedule, fecha, slug, accessToken: booked.accessToken };
}

let file = 0;
function receiptFile(clientId: string, use = "comprobantes") {
  file += 1;
  const publicId = `duali/negocios/${clientId}/imagenes/${use}/comprobante${file}`;
  return { url: `https://res.cloudinary.com/duali-test/image/upload/v1/${publicId}.jpg`, publicId };
}

const attach = (token: string, body: unknown) => call(attachRoute.POST, { token: "", method: "POST", params: { token }, body });

type Receipt = { id: string; estado: string; sale: { saldo: number }; member: { nombre: string } };

describe("spec 014 · enviar comprobante desde la reserva", () => {
  test("firma solo con el enlace privado de una reserva con saldo, en la carpeta de comprobantes", async () => {
    const s = await webBookingWithBalance();
    const signed = expectOk<{ folder: string }>(await call(signatureRoute.POST, { token: "", method: "POST", params: { token: s.accessToken } }));
    assert.equal(signed.folder, `duali/negocios/${s.client.id}/imagenes/comprobantes`);
    expectError(await call(signatureRoute.POST, { token: "", method: "POST", params: { token: "inventado" } }), 404);
  });

  test("adjuntar: queda por revisar y avisa a la dueña; se ve en la página de la reserva", async () => {
    const s = await webBookingWithBalance();
    expectOk(await attach(s.accessToken, receiptFile(s.client.id)), 201);

    const pending = expectOk<Receipt[]>(await call(receiptsRoute.GET, { token: s.token, path: "/api/payment-receipts?estado=POR_REVISAR" }));
    assert.equal(pending.length, 1);
    assert.equal(pending[0].member.nombre, "Laura");
    assert.equal(pending[0].sale.saldo, 15000);

    const push = await prisma.notification.findFirst({ where: { clientId: s.client.id, type: "STUDIO_RECEIPT" } });
    assert.equal(push?.title, "Laura envió un comprobante");

    const view = expectOk<{ comprobantes: Array<{ estado: string }> }>(await call(publicBookingRoute.GET, { token: "", params: { token: s.accessToken } }));
    assert.deepEqual(view.comprobantes.map((item) => item.estado), ["POR_REVISAR"]);
  });

  test("un archivo de otra carpeta o de otro negocio se rechaza", async () => {
    const s = await webBookingWithBalance();
    const other = await createBusiness();
    expectError(await attach(s.accessToken, receiptFile(s.client.id, "publicaciones")), 422);
    expectError(await attach(s.accessToken, receiptFile(other.client.id)), 422);
    assert.equal(await prisma.paymentReceipt.count({ where: { clientId: s.client.id } }), 0);
  });

  test("el cuarto comprobante por revisar se rechaza y su foto se borra", async () => {
    const s = await webBookingWithBalance();
    for (let i = 0; i < 3; i += 1) expectOk(await attach(s.accessToken, receiptFile(s.client.id)), 201);
    expectError(await call(signatureRoute.POST, { token: "", method: "POST", params: { token: s.accessToken } }), 429);
    const fourth = receiptFile(s.client.id);
    expectError(await attach(s.accessToken, fourth), 429);
    assert.deepEqual(offlineDeletions, [fourth.publicId], "no deja huérfana la foto que ya se subió");
  });

  test("sin saldo (pagada) no se firma ni se adjunta", async () => {
    const business = await createBusiness();
    const catalog = await createCatalog(business.token);
    const fecha = addDaysToKey(studioNow().dateKey, 2);
    const [schedule] = await createSchedule(business.token, catalog.disciplines.bodyCombat, [isoWeekday(fecha)]);
    const slug = `pagada-${Date.now()}`;
    await call(publicPageRoute.PUT, { token: business.token, method: "PUT", body: { slug, paginaPublicaActiva: true } });
    // Spec 021 D2: como antes, se vende por la web sin pagar.
    await prisma.client.updateMany({ where: { slug }, data: { permitirPagoEnEstudio: true } });
    const member = await createMember(business.token, "Sara");
    await sell(business.token, member.id, catalog.packages.basicoBodyCombat, { pago: { monto: 55000, metodoPago: "EFECTIVO" } });
    const booked = expectOk<{ accessToken: string }>(
      await call(publicBookingsRoute.POST, {
        token: "",
        method: "POST",
        params: { slug },
        body: { scheduleId: schedule.id, fecha, celular: member.celular, nombre: "Sara" }
      }),
      201
    );
    expectError(await call(signatureRoute.POST, { token: "", method: "POST", params: { token: booked.accessToken } }), 409);
    expectError(await attach(booked.accessToken, receiptFile(business.client.id)), 409);
  });
});

describe("spec 014 · la dueña revisa", () => {
  test("aprobar registra el pago, baja el saldo y no supera el saldo", async () => {
    const s = await webBookingWithBalance();
    expectOk(await attach(s.accessToken, receiptFile(s.client.id)), 201);
    const [receipt] = expectOk<Receipt[]>(await call(receiptsRoute.GET, { token: s.token, path: "/api/payment-receipts?estado=POR_REVISAR" }));

    expectError(
      await call(approveRoute.POST, { token: s.token, method: "POST", params: { id: receipt.id }, body: { monto: 20000, metodoPago: "NEQUI" } }),
      422,
      /saldo/
    );
    // El intento fallido no la deja aprobada.
    assert.equal((await prisma.paymentReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).estado, "POR_REVISAR");

    const approved = expectOk<{ estado: string; paymentId: string }>(
      await call(approveRoute.POST, { token: s.token, method: "POST", params: { id: receipt.id }, body: { monto: 15000, metodoPago: "NEQUI" } })
    );
    assert.equal(approved.estado, "APROBADO");
    assert.ok(approved.paymentId);
    const view = expectOk<{ saldo: number; comprobantes: Array<{ estado: string }> }>(await call(publicBookingRoute.GET, { token: "", params: { token: s.accessToken } }));
    assert.equal(view.saldo, 0);
    assert.equal(view.comprobantes[0].estado, "APROBADO");

    expectError(await call(approveRoute.POST, { token: s.token, method: "POST", params: { id: receipt.id }, body: { monto: 1, metodoPago: "NEQUI" } }), 409);
  });

  test("aprobar dos veces a la vez solo registra un pago", async () => {
    const s = await webBookingWithBalance();
    expectOk(await attach(s.accessToken, receiptFile(s.client.id)), 201);
    const [receipt] = expectOk<Receipt[]>(await call(receiptsRoute.GET, { token: s.token, path: "/api/payment-receipts?estado=POR_REVISAR" }));
    const approve = () => call(approveRoute.POST, { token: s.token, method: "POST", params: { id: receipt.id }, body: { monto: 5000, metodoPago: "NEQUI" } });
    const results = await Promise.all([approve(), approve()]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const sale = await prisma.memberPackage.findFirstOrThrow({ where: { clientId: s.client.id } });
    assert.equal(Number(sale.pagado), 5000);
  });

  test("rechazar borra la foto de Cloudinary y la clienta ve el motivo", async () => {
    const s = await webBookingWithBalance();
    const media = receiptFile(s.client.id);
    expectOk(await attach(s.accessToken, media), 201);
    const [receipt] = expectOk<Receipt[]>(await call(receiptsRoute.GET, { token: s.token, path: "/api/payment-receipts?estado=POR_REVISAR" }));
    expectOk(await call(rejectRoute.POST, { token: s.token, method: "POST", params: { id: receipt.id }, body: { motivo: "No se ve el monto" } }));
    assert.deepEqual(offlineDeletions, [media.publicId]);
    const view = expectOk<{ comprobantes: Array<{ estado: string; motivoRechazo: string }> }>(await call(publicBookingRoute.GET, { token: "", params: { token: s.accessToken } }));
    assert.deepEqual(view.comprobantes[0], { ...view.comprobantes[0], estado: "RECHAZADO", motivoRechazo: "No se ve el monto" });
  });

  test("otro negocio no ve ni revisa los comprobantes; un comprobante en uso no se descarta", async () => {
    const s = await webBookingWithBalance();
    const media = receiptFile(s.client.id);
    expectOk(await attach(s.accessToken, media), 201);
    const [receipt] = expectOk<Receipt[]>(await call(receiptsRoute.GET, { token: s.token, path: "/api/payment-receipts" }));
    const other = await createBusiness();
    assert.equal(expectOk<Receipt[]>(await call(receiptsRoute.GET, { token: other.token, path: "/api/payment-receipts" })).length, 0);
    expectError(await call(rejectRoute.POST, { token: other.token, method: "POST", params: { id: receipt.id }, body: {} }), 404);
    expectError(await call(mediaRoute.DELETE, { token: s.token, method: "DELETE", body: { publicId: media.publicId, kind: "IMAGEN" } }), 409);
  });
});
