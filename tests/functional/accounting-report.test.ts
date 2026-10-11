// Spec 028: Contabilidad como la de CliqCut (periodos, egresos operativos, pagos a instructores).
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as expensesRoute from "@/app/api/expenses/route";
import * as reportRoute from "@/app/api/accounting/report/route";
import type { AccountingReport } from "@/lib/accounting-report";
import { addDaysToKey, studioTodayKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, sell } from "./studio-fixtures";

after(disconnect);

const report = async (token: string, query = "") =>
  expectOk<AccountingReport>(await call(reportRoute.GET, { token, path: `/api/accounting/report${query}` }));

describe("spec 028 · contabilidad", () => {
  test("separa egresos operativos de pagos a instructores y calcula la ganancia neta", async () => {
    const { token, client } = await createBusiness();
    const catalog = await createCatalog(token);
    const member = await createMember(token);
    await sell(token, member.id, catalog.packages.basicoBodyCombat, {
      pago: { monto: 55000, partes: [{ metodo: "EFECTIVO", monto: 40000 }, { metodo: "NEQUI", monto: 15000 }] }
    });
    const today = studioTodayKey();
    expectOk(
      await call(expensesRoute.POST, {
        token,
        method: "POST",
        body: { concepto: "Arriendo", monto: 20000, fecha: today, categoria: "RENT", metodoPago: "TRANSFERENCIA" }
      }),
      201
    );

    // Un pago a instructor deja su egreso (como lo hace payInstructor).
    const instructor = await prisma.instructor.create({ data: { clientId: client.id, nombre: "Mateo", color: "#0ea5e9" } });
    const expense = await prisma.expense.create({
      data: { clientId: client.id, concepto: "Pago a Mateo", monto: 10000, fecha: new Date(), categoria: "COMMISSION", metodoPago: "EFECTIVO" }
    });
    await prisma.instructorPayment.create({
      data: {
        clientId: client.id,
        instructorId: instructor.id,
        tipo: "COMISION",
        monto: 10000,
        fecha: new Date(),
        expenseId: expense.id,
        methods: { create: [{ metodo: "EFECTIVO", monto: 10000 }] }
      }
    });

    const data = await report(token);
    assert.equal(data.period.filter, "month");
    assert.equal(data.income.total, 55000);
    assert.deepEqual(
      data.income.byMethod.map((item) => [item.metodo, item.amount]),
      [
        ["EFECTIVO", 40000],
        ["NEQUI", 15000]
      ]
    );
    assert.deepEqual(data.expenses.operativos, { total: 20000, count: 1 });
    assert.deepEqual(data.expenses.instructores, { total: 10000, count: 1 });
    assert.equal(data.expenses.items.find((item) => item.id === expense.id)?.categoria, "INSTRUCTOR");
    assert.equal(data.net, 25000);

    const mateo = data.instructors.find((item) => item.id === instructor.id);
    assert.equal(mateo?.pagado, 10000);
    assert.equal(mateo?.pagos.length, 1);
  });

  test("los filtros cambian el periodo: un pago de hoy no está en el mes pasado ni mañana", async () => {
    const { token } = await createBusiness();
    const catalog = await createCatalog(token);
    const member = await createMember(token);
    await sell(token, member.id, catalog.packages.basicoRumba, { pago: { monto: 55000, metodoPago: "EFECTIVO" } });
    const today = studioTodayKey();

    assert.equal((await report(token, "?filter=today")).income.total, 55000);
    assert.equal((await report(token, "?filter=lastmonth")).income.total, 0);
    const tomorrow = addDaysToKey(today, 1);
    const custom = await report(token, `?filter=custom&from=${tomorrow}&to=${addDaysToKey(tomorrow, 3)}`);
    assert.deepEqual([custom.period.from, custom.income.total], [tomorrow, 0]);
    assert.equal((await report(token, `?filter=day&day=${today}`)).income.count, 1);
  });

  test("sin ciclos de instructores no ofrece el filtro de ciclo", async () => {
    const { token } = await createBusiness();
    const data = await report(token, "?filter=paymentcycle");
    assert.deepEqual(data.cycles, []);
    // Cae en el mes actual.
    assert.equal(data.period.from.slice(0, 7), studioTodayKey().slice(0, 7));
  });
});
