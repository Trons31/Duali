// Spec 006: clientes del estudio, venta de paquetes, pagos y Contabilidad.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as summaryRoute from "@/app/api/accounting/summary/route";
import * as overviewRoute from "@/app/api/accounting/overview/route";
import * as packageRoute from "@/app/api/packages/[id]/route";
import * as membersRoute from "@/app/api/studio-members/route";
import * as memberRoute from "@/app/api/studio-members/[id]/route";
import * as salesRoute from "@/app/api/member-packages/route";
import * as saleRoute from "@/app/api/member-packages/[id]/route";
import * as paymentsRoute from "@/app/api/member-packages/[id]/payments/route";
import * as paymentRoute from "@/app/api/member-packages/[id]/payments/[paymentId]/route";
import { addDaysToKey, studioTodayKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, sell } from "./studio-fixtures";

after(disconnect);

type SaleView = {
  id: string;
  saldo: number;
  pagado: number;
  precio: number;
  estado: string;
  estadoPago: string;
  vence: string;
  payments: Array<{ id: string; anuladoAt: string | null }>;
};

describe("spec 006 · clientes del estudio", () => {
  test("el celular identifica al cliente: +57 y espacios cuentan como el mismo", async () => {
    const { token } = await createBusiness();
    expectOk(await call(membersRoute.POST, { token, method: "POST", body: { nombre: "Laura", celular: "300 123 4567" } }), 201);
    expectError(
      await call(membersRoute.POST, { token, method: "POST", body: { nombre: "Otra", celular: "+57 300-123-4567" } }),
      409,
      /Laura/
    );
  });

  test("el mismo celular puede existir en dos negocios distintos", async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    expectOk(await call(membersRoute.POST, { token: a.token, method: "POST", body: { nombre: "Ana", celular: "3109998877" } }), 201);
    expectOk(await call(membersRoute.POST, { token: b.token, method: "POST", body: { nombre: "Ana", celular: "3109998877" } }), 201);
  });

  test("crear de nuevo un celular eliminado recupera la ficha con su historia", async () => {
    const { token } = await createBusiness();
    const member = await createMember(token, "Sofía");
    assert.equal((await call(memberRoute.DELETE, { token, method: "DELETE", params: { id: member.id } })).status, 204);
    const restored = expectOk<{ id: string; nombre: string }>(
      await call(membersRoute.POST, { token, method: "POST", body: { nombre: "Sofía R", celular: member.celular } }),
      201
    );
    assert.equal(restored.id, member.id);
    assert.equal(restored.nombre, "Sofía R");
  });

  test("buscar por nombre o por parte del celular", async () => {
    const { token } = await createBusiness();
    await createMember(token, "Valentina");
    const member = await createMember(token, "Camila");
    const byName = expectOk<Array<{ id: string }>>(await call(membersRoute.GET, { token, path: "/api/studio-members?q=cami" }));
    const byPhone = expectOk<Array<{ id: string }>>(
      await call(membersRoute.GET, { token, path: `/api/studio-members?q=${member.celular.slice(-4)}` })
    );
    assert.deepEqual(byName.map((item) => item.id), [member.id]);
    assert.ok(byPhone.some((item) => item.id === member.id));
  });

  test("no se elimina un cliente con paquete vigente", async () => {
    const { token } = await createBusiness();
    const { packages } = await createCatalog(token);
    const member = await createMember(token);
    await sell(token, member.id, packages.basicoBodyCombat);
    expectError(await call(memberRoute.DELETE, { token, method: "DELETE", params: { id: member.id } }), 409);
  });
});

describe("spec 006 · venta de paquetes y pagos", () => {
  test("venta con pago parcial: queda saldo y vence a los 30 días", async () => {
    const { token } = await createBusiness();
    const { packages } = await createCatalog(token);
    const member = await createMember(token);
    const sale = await sell(token, member.id, packages.basicoBodyCombat, { pago: { monto: 30000, metodoPago: "NEQUI" } });
    assert.equal(sale.saldo, 25000);
    assert.equal(sale.inicio, studioTodayKey());
    assert.equal(sale.vence, addDaysToKey(studioTodayKey(), 29));

    const withBalance = expectOk<Array<{ saldo: number; vigentes: unknown[] }>>(await call(membersRoute.GET, { token }));
    assert.equal(withBalance[0].saldo, 25000);
    assert.equal(withBalance[0].vigentes.length, 1);
  });

  test("cambiar el precio del catálogo no cambia una venta ya hecha", async () => {
    const { token } = await createBusiness();
    const { packages } = await createCatalog(token);
    const member = await createMember(token);
    const sale = await sell(token, member.id, packages.basicoBodyCombat);
    await call(packageRoute.PUT, { token, method: "PUT", params: { id: packages.basicoBodyCombat }, body: { precio: 99000, clases: 8 } });
    const stored = await prisma.memberPackage.findUniqueOrThrow({ where: { id: sale.id } });
    assert.equal(Number(stored.precio), 55000);
    assert.equal(stored.clases, 4);
  });

  test("descuento al vender y pago inicial que no supera el precio", async () => {
    const { token } = await createBusiness();
    const { packages } = await createCatalog(token);
    const member = await createMember(token);
    const sale = await sell(token, member.id, packages.basicoBodyCombat, { precio: 50000 });
    assert.equal(sale.saldo, 50000);
    expectError(
      await call(salesRoute.POST, {
        token,
        method: "POST",
        body: { memberId: member.id, packageId: packages.basicoBodyCombat, pago: { monto: 60000, metodoPago: "EFECTIVO" } }
      }),
      422
    );
  });

  test("no se vende un paquete pausado", async () => {
    const { token } = await createBusiness();
    const { packages } = await createCatalog(token);
    const member = await createMember(token);
    await call(packageRoute.PUT, { token, method: "PUT", params: { id: packages.basicoJump }, body: { activo: false } });
    expectError(await call(salesRoute.POST, { token, method: "POST", body: { memberId: member.id, packageId: packages.basicoJump } }), 422);
  });

  test("abonos: hasta el saldo, nunca más; anular un pago devuelve el saldo", async () => {
    const { token } = await createBusiness();
    const { packages } = await createCatalog(token);
    const member = await createMember(token);
    const sale = await sell(token, member.id, packages.basicoBodyCombat, { pago: { monto: 30000, metodoPago: "EFECTIVO" } });

    expectError(
      await call(paymentsRoute.POST, { token, method: "POST", params: { id: sale.id }, body: { monto: 30000, metodoPago: "NEQUI" } }),
      422,
      /saldo/
    );
    const paid = expectOk<SaleView>(
      await call(paymentsRoute.POST, { token, method: "POST", params: { id: sale.id }, body: { monto: 25000, metodoPago: "NEQUI" } }),
      201
    );
    assert.equal(paid.estadoPago, "PAGADO");

    const lastPayment = paid.payments[0];
    const reverted = expectOk<SaleView>(
      await call(paymentRoute.DELETE, { token, method: "DELETE", params: { id: sale.id, paymentId: lastPayment.id } })
    );
    assert.equal(reverted.saldo, 25000);
    expectError(await call(paymentRoute.DELETE, { token, method: "DELETE", params: { id: sale.id, paymentId: lastPayment.id } }), 409);
  });

  test("dos abonos simultáneos por el saldo completo: solo entra uno", async () => {
    const { token } = await createBusiness();
    const { packages } = await createCatalog(token);
    const member = await createMember(token);
    const sale = await sell(token, member.id, packages.basicoBodyCombat);
    const pay = () =>
      call(paymentsRoute.POST, { token, method: "POST", params: { id: sale.id }, body: { monto: 55000, metodoPago: "EFECTIVO" } });
    const results = await Promise.all([pay(), pay()]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 422]);
    const stored = await prisma.memberPackage.findUniqueOrThrow({ where: { id: sale.id } });
    assert.equal(Number(stored.pagado), 55000);
  });

  test("extender el vencimiento, nunca antes del inicio", async () => {
    const { token } = await createBusiness();
    const { packages } = await createCatalog(token);
    const member = await createMember(token);
    const sale = await sell(token, member.id, packages.basicoBodyCombat);
    const nuevo = addDaysToKey(sale.vence, 10);
    const extended = expectOk<SaleView>(await call(saleRoute.PUT, { token, method: "PUT", params: { id: sale.id }, body: { vence: nuevo } }));
    assert.equal(extended.vence, nuevo);
    expectError(
      await call(saleRoute.PUT, { token, method: "PUT", params: { id: sale.id }, body: { vence: addDaysToKey(sale.inicio, -1) } }),
      422
    );
  });
});

describe("spec 006 R5 · Contabilidad", () => {
  test("los pagos de paquetes suman como ingreso y anular la venta los saca", async () => {
    const { token } = await createBusiness({ moduloAcademia: false });
    const { packages } = await createCatalog(token);
    const member = await createMember(token, "Daniela");
    const sale = await sell(token, member.id, packages.basicoBodyCombat, { pago: { monto: 30000, metodoPago: "NEQUI" } });
    await call(paymentsRoute.POST, { token, method: "POST", params: { id: sale.id }, body: { monto: 5000, metodoPago: "EFECTIVO" } });

    let summary = expectOk<{ ingresosPaquetes: number; ingresosTotales: number; pagosRecibidosEsteMes: number }>(
      await call(summaryRoute.GET, { token })
    );
    assert.equal(summary.ingresosPaquetes, 35000);
    assert.equal(summary.ingresosTotales, 35000);
    assert.equal(summary.pagosRecibidosEsteMes, 35000);

    const overview = expectOk<{
      summary: { ingresos: number };
      movements: Array<{ type: string; title: string; amount: number }>;
      paymentMethods: Array<{ method: string; amount: number }>;
    }>(await call(overviewRoute.GET, { token }));
    const packageMovements = overview.movements.filter((movement) => movement.type === "PAQUETE");
    assert.equal(packageMovements.length, 2);
    assert.equal(packageMovements[0].title, "Daniela");
    assert.equal(overview.summary.ingresos, 35000);
    assert.equal(overview.paymentMethods.find((item) => item.method === "Nequi")?.amount, 30000);

    expectOk(await call(saleRoute.PUT, { token, method: "PUT", params: { id: sale.id }, body: { anular: true, motivo: "Error" } }));
    summary = expectOk(await call(summaryRoute.GET, { token }));
    assert.equal(summary.ingresosPaquetes, 0);
    expectError(
      await call(paymentsRoute.POST, { token, method: "POST", params: { id: sale.id }, body: { monto: 1000, metodoPago: "EFECTIVO" } }),
      409
    );
  });

  test("las ventas de otro negocio no aparecen en mi contabilidad", async () => {
    const mine = await createBusiness();
    const other = await createBusiness();
    const { packages } = await createCatalog(other.token);
    const member = await createMember(other.token);
    await sell(other.token, member.id, packages.basicoBodyCombat, { pago: { monto: 55000, metodoPago: "EFECTIVO" } });
    const summary = expectOk<{ ingresosPaquetes: number }>(await call(summaryRoute.GET, { token: mine.token }));
    assert.equal(summary.ingresosPaquetes, 0);
  });
});
