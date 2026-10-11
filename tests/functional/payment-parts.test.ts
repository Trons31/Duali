// Spec 027: varios paquetes en una venta y pago en dos partes en todo Duali.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as overviewRoute from "@/app/api/accounting/overview/route";
import * as expensesRoute from "@/app/api/expenses/route";
import * as expenseRoute from "@/app/api/expenses/[id]/route";
import * as enrollmentPayRoute from "@/app/api/enrollment-payments/[id]/pay/route";
import * as installmentsRoute from "@/app/api/monthly-payments/[id]/installments/route";
import * as monthlyPayRoute from "@/app/api/monthly-payments/[id]/pay/route";
import * as salesRoute from "@/app/api/member-packages/route";
import * as paymentsRoute from "@/app/api/member-packages/[id]/payments/route";
import * as renewRoute from "@/app/api/member-packages/[id]/renew/route";
import { studioTodayKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, sell } from "./studio-fixtures";

after(disconnect);

type Payment = { id: string; monto: number; metodoPago: string; partes: Array<{ metodo: string; monto: number }> };
type SaleView = { id: string; packageId: string; precio: number; pagado: number; saldo: number; payments: Payment[] };
type Overview = { paymentMethods: Array<{ method: string; amount: number }> };

function methods(overview: Overview) {
  return Object.fromEntries(overview.paymentMethods.map((item) => [item.method, item.amount]));
}

async function overview(token: string) {
  const [year, month] = studioTodayKey().split("-");
  return expectOk<Overview>(await call(overviewRoute.GET, { token, path: `/api/accounting/overview?year=${year}&month=${Number(month)}` }));
}

async function academyCharge(clientId: string, monto: number) {
  const group = await prisma.group.create({ data: { clientId, nombre: "Ballet", precioMensualidadDefault: monto } });
  const student = await prisma.student.create({
    data: { clientId, grupoId: group.id, nombre: "Sara", apellido: "Gómez", edad: 10, estado: "INACTIVO" }
  });
  const now = new Date();
  const monthly = await prisma.monthlyPayment.create({
    data: {
      clientId,
      estudianteId: student.id,
      grupoId: group.id,
      mes: now.getMonth() + 1,
      anio: now.getFullYear(),
      monto,
      saldoPendiente: monto,
      fechaVencimiento: now
    }
  });
  const enrollment = await prisma.enrollmentPayment.create({
    data: { clientId, estudianteId: student.id, monto: 50000, saldoPendiente: 50000, fechaVencimiento: now }
  });
  return { monthly, enrollment };
}

describe("spec 027 · venta de varios paquetes (R5)", () => {
  test("vende dos disciplinas a la vez y reparte el pago en dos partes en orden (D4)", async () => {
    const { token } = await createBusiness();
    const catalog = await createCatalog(token);
    const member = await createMember(token, "Camila");

    const sales = expectOk<SaleView[]>(
      await call(salesRoute.POST, {
        token,
        method: "POST",
        body: {
          memberId: member.id,
          items: [
            { packageId: catalog.packages.basicoBodyCombat, precio: 180000 },
            { packageId: catalog.packages.basicoJump, precio: 120000 }
          ],
          pago: {
            monto: 300000,
            partes: [
              { metodo: "EFECTIVO", monto: 200000 },
              { metodo: "NEQUI", monto: 100000 }
            ]
          }
        }
      }),
      201
    );

    assert.equal(sales.length, 2);
    assert.deepEqual(
      sales.map((sale) => [sale.packageId, sale.pagado, sale.saldo]),
      [
        [catalog.packages.basicoBodyCombat, 180000, 0],
        [catalog.packages.basicoJump, 120000, 0]
      ]
    );
    // El primero se paga solo con efectivo; el segundo con lo que sobró de efectivo y el Nequi.
    assert.equal(sales[0].payments[0].metodoPago, "EFECTIVO");
    assert.deepEqual(sales[0].payments[0].partes, []);
    assert.equal(sales[1].payments[0].metodoPago, "MIXTO");
    assert.deepEqual(sales[1].payments[0].partes, [
      { metodo: "EFECTIVO", monto: 20000 },
      { metodo: "NEQUI", monto: 100000 }
    ]);

    // R11: Contabilidad cuadra por método.
    const totals = methods(await overview(token));
    assert.equal(totals.Efectivo, 200000);
    assert.equal(totals.Nequi, 100000);
  });

  test("un abono menor que el total cubre el primero y deja debiendo el resto", async () => {
    const { token } = await createBusiness();
    const catalog = await createCatalog(token);
    const member = await createMember(token);
    const sales = expectOk<SaleView[]>(
      await call(salesRoute.POST, {
        token,
        method: "POST",
        body: {
          memberId: member.id,
          items: [{ packageId: catalog.packages.basicoBodyCombat }, { packageId: catalog.packages.basicoRumba }],
          pago: { monto: 70000, metodoPago: "TRANSFERENCIA" }
        }
      }),
      201
    );
    assert.deepEqual(
      sales.map((sale) => [sale.pagado, sale.saldo]),
      [
        [55000, 0],
        [15000, 40000]
      ]
    );
  });

  test("si un paquete no existe, no se vende ninguno", async () => {
    const { token, client } = await createBusiness();
    const catalog = await createCatalog(token);
    const member = await createMember(token);
    expectError(
      await call(salesRoute.POST, {
        token,
        method: "POST",
        body: { memberId: member.id, items: [{ packageId: catalog.packages.basicoBodyCombat }, { packageId: "no-existe" }] }
      }),
      422
    );
    assert.equal(await prisma.memberPackage.count({ where: { clientId: client.id } }), 0);
  });

  test("el pago no puede superar el total ni partes que no suman", async () => {
    const { token } = await createBusiness();
    const catalog = await createCatalog(token);
    const member = await createMember(token);
    const items = [{ packageId: catalog.packages.basicoBodyCombat }];
    expectError(
      await call(salesRoute.POST, { token, method: "POST", body: { memberId: member.id, items, pago: { monto: 60000, metodoPago: "EFECTIVO" } } }),
      422,
      /superar el total/
    );
    expectError(
      await call(salesRoute.POST, {
        token,
        method: "POST",
        body: {
          memberId: member.id,
          items,
          pago: { monto: 55000, partes: [{ metodo: "EFECTIVO", monto: 30000 }, { metodo: "NEQUI", monto: 20000 }] }
        }
      }),
      422,
      /Falta registrar/
    );
  });
});

describe("spec 027 · pago en dos partes (R4)", () => {
  test("pago del saldo de un plan en dos partes", async () => {
    const { token } = await createBusiness();
    const catalog = await createCatalog(token);
    const member = await createMember(token);
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);

    const updated = expectOk<SaleView>(
      await call(paymentsRoute.POST, {
        token,
        method: "POST",
        params: { id: sale.id },
        body: { monto: 55000, partes: [{ metodo: "BANCOLOMBIA", monto: 35000 }, { metodo: "EFECTIVO", monto: 20000 }] }
      }),
      201
    );
    assert.equal(updated.saldo, 0);
    assert.equal(updated.payments[0].metodoPago, "MIXTO");
    assert.equal(updated.payments[0].partes.length, 2);

    expectError(
      await call(paymentsRoute.POST, {
        token,
        method: "POST",
        params: { id: (await sell(token, member.id, catalog.packages.basicoRumba)).id },
        body: { monto: 55000, partes: [{ metodo: "NEQUI", monto: 30000 }, { metodo: "NEQUI", monto: 25000 }] }
      }),
      422,
      /distintos/
    );
  });

  test("renovar con pago en dos partes", async () => {
    const { token } = await createBusiness();
    const catalog = await createCatalog(token);
    const member = await createMember(token);
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat, { pago: { monto: 55000, metodoPago: "EFECTIVO" } });
    const renewal = expectOk<SaleView>(
      await call(renewRoute.POST, {
        token,
        method: "POST",
        params: { id: sale.id },
        body: { pago: { monto: 55000, partes: [{ metodo: "EFECTIVO", monto: 5000 }, { metodo: "NEQUI", monto: 50000 }] } }
      }),
      201
    );
    assert.equal(renewal.payments[0].metodoPago, "MIXTO");
  });

  test("academia: mensualidad, inscripción y abono en dos partes; Contabilidad por método", async () => {
    const { token, client } = await createBusiness();
    const { monthly, enrollment } = await academyCharge(client.id, 120000);

    expectOk(
      await call(monthlyPayRoute.PUT, {
        token,
        method: "PUT",
        params: { id: monthly.id },
        body: { partes: [{ metodo: "EFECTIVO", monto: 100000 }, { metodo: "NEQUI", monto: 20000 }] }
      })
    );
    const paid = await prisma.monthlyPayment.findUniqueOrThrow({ where: { id: monthly.id }, include: { methodParts: true } });
    assert.equal(paid.metodoPago, "MIXTO");
    assert.equal(paid.methodParts.length, 2);

    expectOk(
      await call(enrollmentPayRoute.PUT, {
        token,
        method: "PUT",
        params: { id: enrollment.id },
        body: { partes: [{ metodo: "BANCOLOMBIA", monto: 30000 }, { metodo: "EFECTIVO", monto: 20000 }] }
      })
    );
    expectError(
      await call(enrollmentPayRoute.PUT, {
        token,
        method: "PUT",
        params: { id: enrollment.id },
        body: { partes: [{ metodo: "BANCOLOMBIA", monto: 30000 }, { metodo: "EFECTIVO", monto: 10000 }] }
      }),
      422
    );

    const totals = methods(await overview(token));
    assert.equal(totals.Efectivo, 120000);
    assert.equal(totals.Nequi, 20000);
    assert.equal(totals.Bancolombia, 30000);
  });

  test("academia: un abono en dos partes guarda sus partes", async () => {
    const { token, client } = await createBusiness();
    const { monthly } = await academyCharge(client.id, 90000);
    expectOk(
      await call(installmentsRoute.POST, {
        token,
        method: "POST",
        params: { id: monthly.id },
        body: { monto: 40000, partes: [{ metodo: "EFECTIVO", monto: 25000 }, { metodo: "NEQUI", monto: 15000 }] }
      }),
      201
    );
    const installment = await prisma.paymentInstallment.findFirstOrThrow({ where: { monthlyPaymentId: monthly.id }, include: { methodParts: true } });
    assert.equal(installment.metodoPago, "MIXTO");
    assert.deepEqual(installment.methodParts.map((part) => [part.metodo, Number(part.monto)]).sort(), [
      ["EFECTIVO", 25000],
      ["NEQUI", 15000]
    ]);
    // Los métodos escritos a mano de antes se siguen aceptando con una sola parte.
    expectOk(await call(installmentsRoute.POST, { token, method: "POST", params: { id: monthly.id }, body: { monto: 10000, metodoPago: "Daviplata" } }), 201);
  });
});

describe("spec 027 · egresos con método (D8)", () => {
  test("un egreso nuevo exige método y acepta dos partes", async () => {
    const { token } = await createBusiness();
    const base = { concepto: "Arriendo", monto: 800000, fecha: studioTodayKey(), categoria: "ARRIENDO" };
    expectError(await call(expensesRoute.POST, { token, method: "POST", body: base }), 422);

    const single = expectOk<{ id: string; metodoPago: string }>(
      await call(expensesRoute.POST, { token, method: "POST", body: { ...base, metodoPago: "TRANSFERENCIA" } }),
      201
    );
    assert.equal(single.metodoPago, "TRANSFERENCIA");

    const split = expectOk<{ id: string; metodoPago: string }>(
      await call(expensesRoute.POST, {
        token,
        method: "POST",
        body: { ...base, partes: [{ metodo: "EFECTIVO", monto: 500000 }, { metodo: "NEQUI", monto: 300000 }] }
      }),
      201
    );
    assert.equal(split.metodoPago, "MIXTO");

    const list = expectOk<Array<{ id: string; partes: unknown[] }>>(await call(expensesRoute.GET, { token }));
    assert.equal(list.find((item) => item.id === split.id)?.partes.length, 2);

    // Cambiar el monto de uno en dos partes pide volver a repartir.
    expectError(await call(expenseRoute.PUT, { token, method: "PUT", params: { id: split.id }, body: { monto: 900000 } }), 422, /dos partes/);
    expectOk(
      await call(expenseRoute.PUT, {
        token,
        method: "PUT",
        params: { id: split.id },
        body: { monto: 900000, metodoPago: "EFECTIVO" }
      })
    );
    assert.equal(await prisma.paymentMethodPart.count({ where: { expenseId: split.id } }), 0);
  });
});
