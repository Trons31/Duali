// Spec 023 fase 3: pagar a instructores, historial, anular y egresos.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as instructorsRoute from "@/app/api/instructors/route";
import * as payRoute from "@/app/api/instructor-payments/pay/route";
import * as historyRoute from "@/app/api/instructor-payments/history/route";
import * as paymentRoute from "@/app/api/instructor-payments/[id]/route";
import * as schedulesRoute from "@/app/api/class-schedules/route";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as expenseRoute from "@/app/api/expenses/[id]/route";
import { getInstructorPayments, savePaySettings, type InstructorCycleView } from "@/lib/instructor-ledger";
import { listPaymentHistory, payInstructor, voidInstructorPayment } from "@/lib/instructor-payments";
import { addDaysToKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, nextDate, sell } from "./studio-fixtures";

after(disconnect);

const WEEKLY = {
  frecuencia: "SEMANAL" as const,
  diaPago: 7,
  frecuenciaSueldo: "MENSUAL" as const,
  diaPagoSueldo: 15,
  diaPagoAbreSiguiente: false,
  inasistenciasCuentan: false,
  pagarClasesVacias: false,
  basePorcentaje: "VENDIDO" as const
};

const at = (fecha: string, hora = "20:00") => new Date(`${fecha}T${hora}:00-05:00`);
const cash = (monto: number) => [{ metodo: "EFECTIVO" as const, monto }];

/** Laura gana $6.000 por alumno; el lunes dicta Body Combat con 8 alumnos = $48.000. */
async function setup() {
  const { token, client } = await createBusiness();
  const catalog = await createCatalog(token);
  const monday = nextDate(1);
  const laura = expectOk<{ id: string }>(
    await call(instructorsRoute.POST, { token, method: "POST", body: { nombre: "Laura", apellido: "Gómez", variable: "ALUMNO_FIJO", valor: 6000 } }),
    201
  );
  const scheduleFor = async (dia: number) => {
    const [row] = expectOk<Array<{ id: string }>>(
      await call(schedulesRoute.POST, {
        token,
        method: "POST",
        body: { disciplineId: catalog.disciplines.bodyCombat, dias: [dia], horaInicio: "18:00", duracionMin: 60, cupo: 20, instructorId: laura.id }
      }),
      201
    );
    return row.id;
  };
  const attend = async (scheduleId: string, fecha: string, count: number) => {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const member = await createMember(token, "Alumna");
      await sell(token, member.id, catalog.packages.basicoBodyCombat);
      const booking = expectOk<{ id: string }>(await call(bookingsRoute.POST, { token, method: "POST", body: { scheduleId, fecha, memberId: member.id } }), 201);
      await prisma.booking.update({ where: { id: booking.id }, data: { estado: "ASISTIO" } });
      ids.push(booking.id);
    }
    return ids;
  };
  await savePaySettings(client.id, WEEKLY);
  const mon = await scheduleFor(1);
  await attend(mon, monday, 8);
  return { token, clientId: client.id, laura: laura.id, monday, scheduleFor, attend };
}

async function cycles(clientId: string, instructorId: string, now: Date) {
  const view = await getInstructorPayments(clientId, now);
  assert.ok(view.configurado);
  return view.instructores.find((item) => item.id === instructorId)?.comision ?? [];
}
const containing = (list: InstructorCycleView[], fecha: string) => list.find((cycle) => cycle.inicio <= fecha && fecha <= cycle.fin);

describe("spec 023 · pagar a un instructor (R11, R14)", () => {
  test("pago parcial: queda saldo, aparece como saldo anterior y se paga después", async () => {
    const { clientId, laura, monday } = await setup();
    await cycles(clientId, laura, at(monday));
    const paid = await payInstructor(clientId, { instructorId: laura, tipo: "COMISION", alcance: "TODO", monto: 30000, metodos: cash(30000) }, at(monday));
    assert.deepEqual([paid.monto, paid.metodo, paid.ciclos.length], [30000, "EFECTIVO", 1]);

    const nextWeek = addDaysToKey(monday, 7);
    const list = await cycles(clientId, laura, at(nextWeek));
    const previous = containing(list, monday)!;
    assert.deepEqual([previous.actual, previous.pagado, previous.pendiente, previous.situacion], [false, 30000, 18000, "PARCIAL"]);

    await payInstructor(clientId, { instructorId: laura, tipo: "COMISION", alcance: "SALDO", monto: 18000, metodos: cash(18000) }, at(nextWeek));
    const settled = await prisma.instructorCycle.findUniqueOrThrow({ where: { id: previous.id } });
    assert.deepEqual([Number(settled.pendiente), settled.situacion], [0, "PAGADO"]);

    // Cada pago crea su egreso de Comisión.
    const expenses = await prisma.expense.findMany({ where: { clientId, deletedAt: null }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(
      expenses.map((item) => [item.concepto, Number(item.monto), item.categoria]),
      [
        ["Pago a Laura Gómez", 30000, "COMMISSION"],
        ["Pago a Laura Gómez", 18000, "COMMISSION"]
      ]
    );
  });

  test("en dos formas a la vez queda como Mixto con su desglose y un solo egreso", async () => {
    const { clientId, laura, monday } = await setup();
    const paid = await payInstructor(
      clientId,
      { instructorId: laura, tipo: "COMISION", alcance: "TODO", monto: 48000, metodos: [{ metodo: "EFECTIVO", monto: 30000 }, { metodo: "NEQUI", monto: 18000 }] },
      at(monday)
    );
    assert.equal(paid.metodo, "MIXTO");
    assert.deepEqual(paid.metodos, [{ metodo: "EFECTIVO", monto: 30000 }, { metodo: "NEQUI", monto: 18000 }]);
    assert.equal(await prisma.expense.count({ where: { clientId } }), 1);
  });

  test("no deja pagar más de lo pendiente, ni saldo anterior si no lo hay; las formas deben sumar", async () => {
    const { token, clientId, laura, monday } = await setup();
    await assert.rejects(
      payInstructor(clientId, { instructorId: laura, tipo: "COMISION", alcance: "TODO", monto: 50000, metodos: cash(50000) }, at(monday)),
      /máximo para esta opción es \$48\.000/
    );
    await assert.rejects(
      payInstructor(clientId, { instructorId: laura, tipo: "COMISION", alcance: "SALDO", monto: 1000, metodos: cash(1000) }, at(monday)),
      /saldo anterior/
    );
    expectError(
      await call(payRoute.POST, {
        token,
        method: "POST",
        body: { instructorId: laura, tipo: "COMISION", monto: 48000, metodos: [{ metodo: "EFECTIVO", monto: 40000 }] }
      }),
      422
    );
  });

  test("un instructor de otro negocio no se puede pagar", async () => {
    const { laura } = await setup();
    const other = await createBusiness();
    expectOk(await call(instructorsRoute.POST, { token: other.token, method: "POST", body: { nombre: "Mario", sueldo: 900000 } }), 201);
    await savePaySettings(other.client.id, WEEKLY);
    await assert.rejects(
      payInstructor(other.client.id, { instructorId: laura, tipo: "COMISION", alcance: "TODO", monto: 1000, metodos: cash(1000) }),
      /no encontrado/
    );
  });

  test("con el ciclo actual pagado, las clases dictadas después se suman; lo ya pagado no cambia", async () => {
    const { clientId, laura, monday, scheduleFor, attend } = await setup();
    await payInstructor(clientId, { instructorId: laura, tipo: "COMISION", alcance: "TODO", monto: 48000, metodos: cash(48000) }, at(monday));
    const wednesday = addDaysToKey(monday, 2);
    await attend(await scheduleFor(3), wednesday, 3);

    const cycle = containing(await cycles(clientId, laura, at(wednesday)), monday)!;
    assert.deepEqual(
      cycle.detalle.map((row) => [row.fecha, row.ganado]),
      [
        [monday, 48000],
        [wednesday, 18000]
      ]
    );
    assert.deepEqual([cycle.generado, cycle.pagado, cycle.pendiente, cycle.situacion], [66000, 48000, 18000, "PARCIAL"]);
  });
});

describe("spec 023 · historial y anular (R13)", () => {
  test("el historial agrupa por ciclo y anular devuelve el saldo y borra el egreso", async () => {
    const { token, clientId, laura, monday } = await setup();
    const first = await payInstructor(clientId, { instructorId: laura, tipo: "COMISION", alcance: "TODO", monto: 20000, metodos: cash(20000) }, at(monday));
    await payInstructor(clientId, { instructorId: laura, tipo: "COMISION", alcance: "TODO", monto: 28000, metodos: cash(28000) }, at(monday, "21:00"));

    const [group] = expectOk<Awaited<ReturnType<typeof listPaymentHistory>>>(await call(historyRoute.GET, { token }));
    assert.equal(group.pagos.length, 2);
    assert.equal(group.total, 48000);

    // El egreso de un pago solo se cambia anulando el pago.
    const expenseId = (await prisma.instructorPayment.findUniqueOrThrow({ where: { id: first.id } })).expenseId!;
    expectError(await call(expenseRoute.DELETE, { token, method: "DELETE", params: { id: expenseId } }), 409, /anula el pago/);

    expectError(await call(paymentRoute.DELETE, { token, method: "DELETE", params: { id: first.id }, body: {} }), 422);
    const voided = expectOk<{ anulado: boolean; motivoAnulacion: string }>(
      await call(paymentRoute.DELETE, { token, method: "DELETE", params: { id: first.id }, body: { motivo: "Se registró dos veces" } })
    );
    assert.deepEqual([voided.anulado, voided.motivoAnulacion], [true, "Se registró dos veces"]);
    assert.ok((await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } })).deletedAt);
    await assert.rejects(voidInstructorPayment(clientId, first.id, "otra vez"), /ya está anulado/);

    const cycle = containing(await cycles(clientId, laura, at(monday, "22:00")), monday)!;
    assert.deepEqual([cycle.pagado, cycle.pendiente], [28000, 20000]);
    const [after] = await listPaymentHistory(clientId);
    assert.equal(after.total, 28000, "lo anulado no suma");

    const detail = expectOk<{ detalleCiclos: Array<{ formaDePago: string; ciclo: { detalle: unknown[] } }> }>(
      await call(paymentRoute.GET, { token, params: { id: first.id } })
    );
    assert.equal(detail.detalleCiclos[0].formaDePago, "$6.000 por alumno");
    assert.equal(detail.detalleCiclos[0].ciclo.detalle.length, 1);
  });
});
