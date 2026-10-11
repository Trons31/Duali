// Spec 029: el seed de escenarios de validación sobre un demo como el real.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as reportRoute from "@/app/api/accounting/report/route";
import type { AccountingReport } from "@/lib/accounting-report";
import { studioTodayKey } from "@/lib/studio-time";
import { seedDemoStudio } from "../../scripts/demo-studio";
import { seedDemoValidation } from "../../scripts/demo-validation";
import { call, createBusiness, disconnect, expectOk, prisma } from "./helpers";

after(disconnect);

const quiet = () => undefined;

async function counts(clientId: string) {
  const [instructores, clientes, ventas, pagos, reservas, egresos, pagosInstructor, ciclos] = await Promise.all([
    prisma.instructor.count({ where: { clientId } }),
    prisma.studioMember.count({ where: { clientId } }),
    prisma.memberPackage.count({ where: { clientId } }),
    prisma.memberPackagePayment.count({ where: { clientId } }),
    prisma.booking.count({ where: { clientId } }),
    prisma.expense.count({ where: { clientId } }),
    prisma.instructorPayment.count({ where: { clientId } }),
    prisma.instructorCycle.count({ where: { clientId } })
  ]);
  return { instructores, clientes, ventas, pagos, reservas, egresos, pagosInstructor, ciclos };
}

describe("spec 029 · seed de validación del demo", () => {
  test("sin el estudio demo no escribe nada y lo explica", async () => {
    const business = await createBusiness({ moduloAcademia: false });
    const email = `sin-estudio-${Date.now()}@test.duali`;
    await prisma.client.update({ where: { id: business.client.id }, data: { email } });
    await assert.rejects(seedDemoValidation({ apply: true, email, log: quiet }), /seed del estudio demo/);
    assert.equal((await counts(business.client.id)).clientes, 0);
  });

  test("simula sin escribir; al aplicar deja cada escenario y no duplica al repetirse", async () => {
    const business = await createBusiness({ moduloAcademia: false });
    const email = `demo-validacion-${Date.now()}@test.duali`;
    await prisma.client.update({ where: { id: business.client.id }, data: { email } });
    await seedDemoStudio({ apply: true, email, log: quiet });
    const clientId = business.client.id;

    const base = await counts(clientId);
    await seedDemoValidation({ apply: false, email, log: quiet });
    assert.deepEqual(await counts(clientId), base, "la simulación no escribe");

    const lines: string[] = [];
    await seedDemoValidation({ apply: true, email, log: (line) => lines.push(line) });
    assert.equal(lines.filter((line) => line.includes("!")).length, 0, `sin errores:\n${lines.join("\n")}`);
    const after1 = await counts(clientId);

    // Instructores titulares y pagos a instructores desde hace seis semanas.
    assert.equal(after1.instructores, 3);
    assert.equal(await prisma.classSchedule.count({ where: { clientId, deletedAt: null, instructorId: null } }), 0);
    const settings = await prisma.instructorPaymentSettings.findUniqueOrThrow({ where: { clientId } });
    assert.ok(settings.activadoEl.toISOString().slice(0, 10) < studioTodayKey());
    assert.ok(after1.ciclos > 3, "hay ciclos anteriores");

    // Historial de pagos a instructores: total, en dos partes y parcial; y saldo para pagar hoy.
    assert.ok(after1.pagosInstructor >= 3, `pagos a instructores: ${after1.pagosInstructor}\n${lines.join("\n")}\n${JSON.stringify(await prisma.instructorCycle.findMany({ where: { clientId }, select: { tipo: true, inicio: true, fin: true, venceEl: true, clases: true, alumnos: true, generado: true, neto: true, pendiente: true, instructor: { select: { nombre: true } } }, orderBy: { inicio: "asc" } }))}`);
    const split = await prisma.instructorPayment.findFirst({ where: { clientId }, include: { methods: true }, orderBy: { fecha: "asc" }, skip: 1 });
    assert.ok(split, "hay al menos dos pagos");
    assert.ok(await prisma.instructorPaymentMethod.count({ where: { payment: { clientId } } }) > after1.pagosInstructor, "uno se pagó en dos partes");
    assert.ok(await prisma.instructorCycle.count({ where: { clientId, pendiente: { gt: 0 }, venceEl: { lt: new Date(`${studioTodayKey()}T00:00:00.000Z`) } } }), "queda saldo anterior por pagar hoy");
    const paymentDays = await prisma.instructorPayment.findMany({ where: { clientId }, select: { fecha: true } });
    assert.ok(paymentDays.every((row) => row.fecha.toISOString().slice(0, 10) < studioTodayKey()), "los pagos quedaron en su día de pago");

    // Asistencias: asistió, no asistió y sin marcar en clases pasadas.
    const states = await prisma.booking.groupBy({ by: ["estado"], where: { clientId }, _count: true });
    const byState = Object.fromEntries(states.map((row) => [row.estado, row._count]));
    assert.ok(byState.ASISTIO > 5 && byState.NO_ASISTIO >= 2 && byState.RESERVADA >= 1, JSON.stringify(byState));
    assert.ok(await prisma.booking.count({ where: { clientId, sinReserva: true } }), "una llegó sin reservar");

    // Cobros: saldo vencido, abonos en dos partes y un pago anulado.
    const mariana = await prisma.memberPackage.findFirstOrThrow({ where: { clientId, member: { celular: "3000000202" } } });
    assert.ok(mariana.fechaLimitePago && mariana.fechaLimitePago.toISOString().slice(0, 10) < studioTodayKey() && Number(mariana.pagado) === 0);
    assert.ok(await prisma.memberPackagePayment.count({ where: { clientId, anuladoAt: { not: null } } }), "un pago anulado");
    assert.ok(await prisma.paymentMethodPart.count({ where: { clientId } }) >= 4, "pagos y egresos en dos partes");
    assert.equal(await prisma.memberPackage.count({ where: { clientId, member: { celular: "3000000207" } } }), 2, "dos disciplinas en una venta");
    assert.ok(await prisma.memberPackage.count({ where: { clientId, renovacionDeId: { not: null } } }), "un plan renovado");

    // Contabilidad del mes separa operativos e instructores y cuadra.
    const report = expectOk<AccountingReport>(await call(reportRoute.GET, { token: business.token, path: "/api/accounting/report" }));
    assert.ok(report.expenses.operativos.count >= 4);
    assert.equal(report.net, report.income.total - report.expenses.total);
    assert.ok(report.instructors.length >= 3);

    // Correrlo otra vez no duplica nada.
    await seedDemoValidation({ apply: true, email, log: quiet });
    assert.deepEqual(await counts(clientId), after1);
  });
});
