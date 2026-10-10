// Spec 020: renovaciones, fecha limite del saldo, vencidos y avisos.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as profileRoute from "@/app/api/client/profile/route";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as salesRoute from "@/app/api/member-packages/route";
import * as saleRoute from "@/app/api/member-packages/[id]/route";
import * as renewRoute from "@/app/api/member-packages/[id]/renew/route";
import * as planRoute from "@/app/api/public/plans/[token]/route";
import * as planRenewRoute from "@/app/api/public/plans/[token]/renew/route";
import * as purchaseRoute from "@/app/api/public/studios/[slug]/plans/route";
import * as remindersRoute from "@/app/api/studio-reminders/route";
import { getStudioDashboard } from "@/lib/studio-dashboard";
import { addDaysToKey, dateKeyToDate, studioTodayKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, sell } from "./studio-fixtures";

after(disconnect);

const PHOTO = `data:image/png;base64,iVBORw0KGgo${"A".repeat(400)}`;
const receipt = { tipo: "COMPROBANTE", comprobante: PHOTO, metodo: "Nequi" };

type Sale = {
  id: string;
  memberId: string;
  inicio: string;
  vence: string;
  saldo: number;
  estado: string;
  situacionPago: string;
  fechaLimitePago: string;
  saldoVencido: boolean;
  diasAtrasoSaldo: number;
  diasVencido: number;
  puedeRenovar: boolean;
  renovadoPor: { id: string; vence: string } | null;
  renovacionDe: { id: string; inicio: string; vence: string } | null;
};
type Reminder = { refKey: string; saleId?: string; detalle: string; mensaje: string; member: { id: string } };
type Reminders = Record<"manana" | "porVencer" | "saldos" | "listaEspera" | "vencidos" | "saldosVencidos", Reminder[]>;

let counter = 0;
let phone = 3_200_000_000;
const today = () => studioTodayKey();
const daysAgo = (days: number) => addDaysToKey(today(), -days);

async function studio(settings: Record<string, unknown> = {}) {
  const business = await createBusiness();
  const catalog = await createCatalog(business.token);
  counter += 1;
  const slug = `renueva-${Date.now()}-${counter}`;
  expectOk(await call(publicPageRoute.PUT, { token: business.token, method: "PUT", body: { slug, paginaPublicaActiva: true } }));
  expectOk(
    await call(profileRoute.PUT, {
      token: business.token,
      method: "PUT",
      body: { paymentMethodItems: [{ name: "Nequi", account: "300 123 4567" }], ...settings }
    })
  );
  return { ...business, catalog, slug };
}

async function sales(token: string) {
  return expectOk<Sale[]>(await call(salesRoute.GET, { token }));
}

async function saleById(token: string, id: string) {
  return (await sales(token)).find((sale) => sale.id === id)!;
}

function renew(token: string, id: string, body: Record<string, unknown> = {}) {
  return call<Sale>(renewRoute.POST, { token, method: "POST", params: { id }, body });
}

function reminders(token: string, memberId?: string) {
  return call<Reminders>(remindersRoute.GET, { token, path: memberId ? `/?memberId=${memberId}` : "/" });
}

describe("spec 020 · renovar", () => {
  test("un plan vigente se renueva desde el día siguiente a su vencimiento; uno vencido, desde hoy", async () => {
    const s = await studio();
    const laura = await createMember(s.token, "Laura");
    const vigente = await sell(s.token, laura.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(27) });

    const renewal = expectOk(await renew(s.token, vigente.id, { pago: { monto: 55000, metodoPago: "NEQUI" } }), 201);
    assert.equal(renewal.inicio, addDaysToKey(vigente.vence, 1), "no pierde días");
    assert.equal(renewal.renovacionDe?.id, vigente.id);
    assert.equal(renewal.saldo, 0);

    const previous = await saleById(s.token, vigente.id);
    assert.equal(previous.renovadoPor?.id, renewal.id);
    assert.equal(previous.puedeRenovar, false);
    expectError(await renew(s.token, vigente.id), 409, /ya se renovó/);

    const sara = await createMember(s.token, "Sara");
    const vencido = await sell(s.token, sara.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(45) });
    const afterExpiry = await saleById(s.token, vencido.id);
    assert.equal(afterExpiry.estado, "VENCIDO");
    // 30 días de vigencia: empezó hace 45, venció hace 16.
    assert.equal(afterExpiry.diasVencido, 16);
    assert.equal(afterExpiry.puedeRenovar, true);
    const fromToday = expectOk(await renew(s.token, vencido.id), 201);
    assert.equal(fromToday.inicio, today());
  });

  test("anular la renovación deja la anterior como estaba y se puede renovar otra vez", async () => {
    const s = await studio();
    const member = await createMember(s.token, "Camila");
    const sale = await sell(s.token, member.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(40) });
    const renewal = expectOk(await renew(s.token, sale.id), 201);

    expectOk(await call(saleRoute.PUT, { token: s.token, method: "PUT", params: { id: renewal.id }, body: { anular: true } }));
    const restored = await saleById(s.token, sale.id);
    assert.equal(restored.renovadoPor, null);
    assert.equal(restored.puedeRenovar, true);
    expectOk(await renew(s.token, sale.id), 201);
  });

  test("las clases sueltas no se renuevan y otro negocio no puede renovar", async () => {
    const s = await studio();
    const other = await studio();
    const member = await createMember(s.token, "Ana");
    const dropIn = await sell(s.token, member.id, s.catalog.packages.individualBodyCombat);
    expectError(await renew(s.token, dropIn.id), 422, /clases sueltas/);

    const plan = await sell(s.token, member.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(40) });
    expectError(await renew(other.token, plan.id), 404);
  });
});

describe("spec 020 · fecha límite del saldo", () => {
  test("usa el plazo de Ajustes, acepta una fecha propia y marca el saldo vencido con sus días", async () => {
    const s = await studio({ diasPlazoSaldo: 3 });
    const member = await createMember(s.token, "Valentina");

    const late = await sell(s.token, member.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(5), pago: { monto: 20000, metodoPago: "EFECTIVO" } });
    const view = await saleById(s.token, late.id);
    assert.equal(view.fechaLimitePago, addDaysToKey(daysAgo(5), 3));
    assert.equal(view.saldoVencido, true);
    assert.equal(view.diasAtrasoSaldo, 2);

    const own = await sell(s.token, member.id, s.catalog.packages.basicoRumba, { inicio: daysAgo(5), fechaLimitePago: addDaysToKey(today(), 10) });
    const ownView = await saleById(s.token, own.id);
    assert.equal(ownView.fechaLimitePago, addDaysToKey(today(), 10));
    assert.equal(ownView.saldoVencido, false);

    expectError(
      await call(salesRoute.POST, {
        token: s.token,
        method: "POST",
        body: { memberId: member.id, packageId: s.catalog.packages.basicoJump, inicio: today(), fechaLimitePago: daysAgo(1) }
      }),
      422,
      /antes del inicio/
    );

    const paid = await sell(s.token, member.id, s.catalog.packages.basicoJump, {
      fechaLimitePago: addDaysToKey(today(), 4),
      pago: { monto: 65000, metodoPago: "NEQUI" }
    });
    const row = await prisma.memberPackage.findUniqueOrThrow({ where: { id: paid.id } });
    assert.equal(row.fechaLimitePago, null, "si queda pagado, no guarda fecha límite");
  });

  test("el plazo de Ajustes se valida", async () => {
    const s = await studio();
    expectError(await call(profileRoute.PUT, { token: s.token, method: "PUT", body: { diasPlazoSaldo: 120 } }), 422);
    const saved = expectOk<{ diasPlazoSaldo: number }>(await call(profileRoute.PUT, { token: s.token, method: "PUT", body: { diasPlazoSaldo: 10 } }));
    assert.equal(saved.diasPlazoSaldo, 10);
  });

  test("un pago en revisión no está vencido ni sale para cobrar en Avisos", async () => {
    const s = await studio();
    phone += 1;
    const bought = expectOk<{ accessToken: string }>(
      await call(purchaseRoute.POST, {
        token: "",
        method: "POST",
        params: { slug: s.slug },
        body: { packageId: s.catalog.packages.basicoBodyCombat, celular: String(phone), nombre: "Lucía", pago: receipt }
      }),
      201
    );
    // La compra fue hace 20 días: el plazo de 7 ya pasó.
    await prisma.memberPackage.update({
      where: { accessToken: bought.accessToken },
      data: { inicio: dateKeyToDate(daysAgo(20)), vence: dateKeyToDate(addDaysToKey(daysAgo(20), 29)) }
    });

    const [sale] = await sales(s.token);
    assert.equal(sale.situacionPago, "EN_REVISION");
    assert.equal(sale.saldoVencido, false);
    const list = expectOk(await reminders(s.token));
    assert.equal(list.saldos.length, 0);
    assert.equal(list.saldosVencidos.length, 0);
  });
});

describe("spec 020 · vencidos y avisos", () => {
  test("Avisos lista vencidos sin renovar y saldos vencidos; ?memberId trae solo los de ese cliente", async () => {
    const s = await studio();
    const other = await studio();

    const ida = await createMember(s.token, "Ida");
    await sell(s.token, ida.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(39), pago: { monto: 55000, metodoPago: "EFECTIVO" } });

    // Vencido, pero ya tiene otro plan vigente: no sale.
    const eva = await createMember(s.token, "Eva");
    await sell(s.token, eva.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(39), pago: { monto: 55000, metodoPago: "EFECTIVO" } });
    await sell(s.token, eva.id, s.catalog.packages.basicoRumba, { pago: { monto: 55000, metodoPago: "EFECTIVO" } });

    // Vencido y renovado: no sale.
    const rosa = await createMember(s.token, "Rosa");
    const rosaSale = await sell(s.token, rosa.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(39), pago: { monto: 55000, metodoPago: "EFECTIVO" } });
    expectOk(await renew(s.token, rosaSale.id, { pago: { monto: 55000, metodoPago: "EFECTIVO" } }), 201);

    // Vencido hace mas de 60 dias: ya no sale.
    const old = await createMember(s.token, "Olga");
    await sell(s.token, old.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(120), pago: { monto: 55000, metodoPago: "EFECTIVO" } });

    const debt = await createMember(s.token, "Dora");
    await sell(s.token, debt.id, s.catalog.packages.basicoRumba, { inicio: daysAgo(10) });

    const foreign = await createMember(other.token, "Ajena");
    await sell(other.token, foreign.id, other.catalog.packages.basicoBodyCombat, { inicio: daysAgo(39) });

    const list = expectOk(await reminders(s.token));
    assert.deepEqual(list.vencidos.map((item) => item.member.id), [ida.id]);
    assert.match(list.vencidos[0].detalle, /venció hace 10 días/);
    assert.match(list.vencidos[0].mensaje, /venció el .*renovarlo/s);
    assert.deepEqual(list.saldosVencidos.map((item) => item.member.id), [debt.id]);
    assert.match(list.saldosVencidos[0].detalle, /vencido hace 3 días/);
    assert.match(list.saldosVencidos[0].mensaje, /Nequi: 300 123 4567/);
    assert.equal(JSON.stringify(list).includes("Ajena"), false, "no mezcla negocios");

    const forDora = expectOk(await reminders(s.token, debt.id));
    assert.equal(forDora.saldosVencidos.length, 1);
    assert.equal(forDora.vencidos.length, 0);
    assert.ok(forDora.saldosVencidos[0].saleId);
  });

  test("Inicio cuenta los saldos vencidos y los planes vencidos esta semana sin renovar", async () => {
    const s = await studio();
    const a = await createMember(s.token, "Alba");
    await sell(s.token, a.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(32), pago: { monto: 55000, metodoPago: "EFECTIVO" } });
    const b = await createMember(s.token, "Bea");
    await sell(s.token, b.id, s.catalog.packages.basicoBodyCombat, { inicio: daysAgo(50), pago: { monto: 55000, metodoPago: "EFECTIVO" } });
    const c = await createMember(s.token, "Clara");
    await sell(s.token, c.id, s.catalog.packages.basicoRumba, { inicio: daysAgo(8) });

    const data = await getStudioDashboard(s.client.id);
    assert.equal(data.atender.vencidosSemana, 1, "solo el que venció hace 3 días");
    assert.equal(data.atender.saldosVencidos, 1);
  });
});

describe("spec 020 · renovar desde Mi plan", () => {
  test("renueva sin pedir datos, con comprobante, y la venta nueva dice de cuál viene", async () => {
    const s = await studio();
    phone += 1;
    const bought = expectOk<{ accessToken: string }>(
      await call(purchaseRoute.POST, {
        token: "",
        method: "POST",
        params: { slug: s.slug },
        body: { packageId: s.catalog.packages.basicoBodyCombat, celular: String(phone), nombre: "Marta", pago: receipt }
      }),
      201
    );
    const token = bought.accessToken;
    const fresh = expectOk<{ puedeRenovar: boolean }>(await call(planRoute.GET, { token: "", params: { token } }));
    assert.equal(fresh.puedeRenovar, false, "recién comprado no se renueva");

    await prisma.memberPackage.update({
      where: { accessToken: token },
      data: { inicio: dateKeyToDate(daysAgo(40)), vence: dateKeyToDate(daysAgo(11)) }
    });
    const expired = expectOk<{ puedeRenovar: boolean; inicioRenovacion: string }>(await call(planRoute.GET, { token: "", params: { token } }));
    assert.equal(expired.puedeRenovar, true);
    assert.equal(expired.inicioRenovacion, today());

    const renewBody = (body: Record<string, unknown>) => call(planRenewRoute.POST, { token: "", method: "POST", params: { token }, body });
    expectError(await call(planRenewRoute.POST, { token: "", method: "POST", params: { token }, body: {} }), 422);
    const renewed = expectOk<{ accessToken: string; plan: { situacionPago: string; inicio: string } }>(await renewBody({ pago: receipt }), 201);
    assert.notEqual(renewed.accessToken, token);
    assert.equal(renewed.plan.situacionPago, "EN_REVISION");
    assert.equal(renewed.plan.inicio, today());

    const row = await prisma.memberPackage.findUniqueOrThrow({ where: { accessToken: renewed.accessToken }, include: { renovacionDe: true } });
    assert.equal(row.renovacionDe?.accessToken, token);
    assert.equal(row.origen, "PUBLICO");

    const old = expectOk<{ puedeRenovar: boolean; renovacion: { enlace: string } | null }>(await call(planRoute.GET, { token: "", params: { token } }));
    assert.equal(old.puedeRenovar, false);
    assert.equal(old.renovacion?.enlace, renewed.accessToken);
    expectError(await renewBody({ pago: receipt }), 409, /ya se renovó/);

    expectError(await call(planRenewRoute.POST, { token: "", method: "POST", params: { token: "inventado" }, body: { pago: receipt } }), 404);
  });
});
