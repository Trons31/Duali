// Spec 013: indicadores del Inicio del estudio con datos reales.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import * as saleRoute from "@/app/api/member-packages/[id]/route";
import * as paymentsRoute from "@/app/api/member-packages/[id]/payments/route";
import * as paymentRoute from "@/app/api/member-packages/[id]/payments/[paymentId]/route";
import * as publicBookingsRoute from "@/app/api/public/studios/[slug]/bookings/route";
import { getStudioDashboard } from "@/lib/studio-dashboard";
import { addDaysToKey, isoWeekday, studioNow } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectOk, prisma } from "./helpers";
import { createCatalog, createMember, createSchedule, sell } from "./studio-fixtures";

after(disconnect);

// Mediodia de hoy en Bogota: las clases de las 18:00 de hoy siguen por delante.
const noon = () => new Date(`${studioNow().dateKey}T12:00:00-05:00`);

describe("spec 013 · Inicio del estudio", () => {
  test("un estudio nuevo ve los pasos para empezar y todo en cero", async () => {
    const { client } = await createBusiness();
    const data = await getStudioDashboard(client.id, noon());
    assert.deepEqual(data.pasos, { disciplinas: false, paquetes: false, horario: false, pagina: false });
    assert.equal(data.clasesHoy, 0);
    assert.equal(data.ocupacionSemana, null);
    assert.equal(data.ingresosMes, 0);
  });

  test("clases y reservas de hoy, ocupación de la semana sin canceladas", async () => {
    const { client, token } = await createBusiness();
    const { disciplines, packages } = await createCatalog(token);
    const today = studioNow().dateKey;
    const weekday = isoWeekday(today);
    const [bodyCombat] = await createSchedule(token, disciplines.bodyCombat, [weekday], { horaInicio: "18:00", cupo: 15 });
    await createSchedule(token, disciplines.jump, [weekday], { horaInicio: "19:00", cupo: 15 });
    const [rumba] = await createSchedule(token, disciplines.rumba, [weekday], { horaInicio: "20:00", cupo: 15 });

    for (const nombre of ["Ana", "Bea", "Cata"]) {
      const member = await createMember(token, nombre);
      await sell(token, member.id, packages.basicoBodyCombat);
      expectOk(await call(bookingsRoute.POST, { token, method: "POST", body: { scheduleId: bodyCombat.id, fecha: today, memberId: member.id } }), 201);
    }
    // La de Rumba se cancela: no cuenta como clase ni en la ocupación.
    await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: rumba.id, fecha: today, cancelada: true } });

    const data = await getStudioDashboard(client.id, noon());
    assert.equal(data.clasesHoy, 2);
    assert.equal(data.reservasHoy, 3);
    assert.equal(data.clasesDeHoy.length, 3, "la cancelada se lista, marcada");
    assert.equal(data.clasesDeHoy.find((item) => item.cancelada)?.discipline.nombre, "Rumba Fit");
    // Esta semana solo hay estas clases (los horarios se crearon hoy): 3 reservas / 30 cupos.
    assert.equal(data.ocupacionSemana, 10);
  });

  test("ingresos del mes sin pagos ni ventas anuladas; por cobrar", async () => {
    const { client, token } = await createBusiness();
    const { packages } = await createCatalog(token);
    const laura = await createMember(token, "Laura");
    const sale = await sell(token, laura.id, packages.basicoBodyCombat, { pago: { monto: 30000, metodoPago: "NEQUI" } });
    const second = expectOk<{ payments: Array<{ id: string }> }>(
      await call(paymentsRoute.POST, { token, method: "POST", params: { id: sale.id }, body: { monto: 5000, metodoPago: "EFECTIVO" } }),
      201
    );
    await call(paymentRoute.DELETE, { token, method: "DELETE", params: { id: sale.id, paymentId: second.payments[0].id } });

    const voided = await createMember(token, "Anulada");
    const voidedSale = await sell(token, voided.id, packages.basicoRumba, { pago: { monto: 55000, metodoPago: "EFECTIVO" } });
    await call(saleRoute.PUT, { token, method: "PUT", params: { id: voidedSale.id }, body: { anular: true } });

    const data = await getStudioDashboard(client.id, noon());
    assert.equal(data.ingresosMes, 30000);
    assert.equal(data.porCobrar, 25000);
    assert.equal(data.atender.conSaldo, 1);
    assert.equal(data.vigentes, 1);
  });

  test("reservas recientes: solo las de la página pública y del propio negocio", async () => {
    const { client, token } = await createBusiness();
    const { disciplines, packages } = await createCatalog(token);
    const fecha = addDaysToKey(studioNow().dateKey, 2);
    const [schedule] = await createSchedule(token, disciplines.bodyCombat, [isoWeekday(fecha)]);
    const slug = `inicio-${Date.now()}`;
    expectOk(await call(publicPageRoute.PUT, { token, method: "PUT", body: { slug, paginaPublicaActiva: true } }));
    // Spec 021 D2: como antes, se vende por la web sin pagar.
    await prisma.client.updateMany({ where: { slug }, data: { permitirPagoEnEstudio: true } });

    expectOk(
      await call(publicBookingsRoute.POST, {
        token: "",
        method: "POST",
        params: { slug },
        body: { scheduleId: schedule.id, fecha, celular: "3117770001", nombre: "Web", packageId: packages.individualBodyCombat, pago: { tipo: "EN_ESTUDIO" } }
      }),
      201
    );
    const panel = await createMember(token, "Panel");
    await sell(token, panel.id, packages.basicoBodyCombat);
    expectOk(await call(bookingsRoute.POST, { token, method: "POST", body: { scheduleId: schedule.id, fecha, memberId: panel.id } }), 201);

    const other = await createBusiness();
    const data = await getStudioDashboard(client.id, noon());
    assert.deepEqual(data.recientes.map((item) => item.member.nombre), ["Web"]);
    assert.equal(data.pasos.pagina, true);
    assert.equal((await getStudioDashboard(other.client.id, noon())).recientes.length, 0);
  });
});
