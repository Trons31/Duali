// Spec 005: horario fijo, clases de cada fecha y cupos.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as schedulesRoute from "@/app/api/class-schedules/route";
import * as scheduleRoute from "@/app/api/class-schedules/[id]/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import { addDaysToKey, isoWeekday, startOfWeekKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createSchedule, nextDate } from "./studio-fixtures";

after(disconnect);

type Session = { scheduleId: string; sessionId: string | null; fecha: string; horaInicio: string; cupo: number; cancelada: boolean; reservadas: number };

async function week(token: string, from: string) {
  return expectOk<Session[]>(
    await call(sessionsRoute.GET, { token, path: `/api/class-sessions?from=${from}&to=${addDaysToKey(from, 6)}` })
  );
}

describe("spec 005 · horario de clases y cupos", () => {
  test("L-M-V en un solo paso aparece en esos días de la semana", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const created = await createSchedule(token, disciplines.bodyCombat, [1, 3, 5]);
    assert.deepEqual(created.map((item) => item.diaSemana).sort(), [1, 3, 5]);

    const monday = startOfWeekKey(nextDate(1, 7));
    const sessions = await week(token, monday);
    assert.deepEqual(sessions.map((item) => isoWeekday(item.fecha)), [1, 3, 5]);
    assert.ok(sessions.every((item) => item.cupo === 15 && item.horaInicio === "18:00" && item.reservadas === 0));
  });

  test("un horario nuevo no inventa clases en semanas pasadas", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    await createSchedule(token, disciplines.bodyCombat, [1, 2, 3, 4, 5, 6, 7]);
    const lastWeek = addDaysToKey(startOfWeekKey(nextDate(1, 0)), -14);
    assert.equal((await week(token, lastWeek)).length, 0);
  });

  test("un combo no tiene horario propio y la hora debe ser válida", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    expectError(
      await call(schedulesRoute.POST, {
        token,
        method: "POST",
        body: { disciplineId: disciplines.mix, dias: [1], horaInicio: "18:00", duracionMin: 60, cupo: 10 }
      }),
      422,
      /combo/
    );
    expectError(
      await call(schedulesRoute.POST, {
        token,
        method: "POST",
        body: { disciplineId: disciplines.jump, dias: [1], horaInicio: "25:00", duracionMin: 60, cupo: 10 }
      }),
      422
    );
  });

  test("cambiar el cupo de una fecha no cambia el de las demás semanas", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const [schedule] = await createSchedule(token, disciplines.jump, [1]);
    const monday = nextDate(1, 7);

    expectOk(await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedule.id, fecha: monday, cupo: 10 } }));

    const [thisWeek] = await week(token, startOfWeekKey(monday));
    const [following] = await week(token, startOfWeekKey(addDaysToKey(monday, 7)));
    assert.equal(thisWeek.cupo, 10);
    assert.ok(thisWeek.sessionId, "la fecha ajustada queda guardada");
    assert.equal(following.cupo, 15);
    assert.equal(following.sessionId, null, "las demás siguen calculadas");
  });

  test("cancelar y reactivar una fecha", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const [schedule] = await createSchedule(token, disciplines.jump, [1]);
    const monday = nextDate(1, 7);

    await call(sessionsRoute.PUT, {
      token,
      method: "PUT",
      body: { scheduleId: schedule.id, fecha: monday, cancelada: true, motivoCancelacion: "Festivo" }
    });
    let [session] = await week(token, startOfWeekKey(monday));
    assert.equal(session.cancelada, true);

    await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedule.id, fecha: monday, cancelada: false } });
    [session] = await week(token, startOfWeekKey(monday));
    assert.equal(session.cancelada, false);
  });

  test("una fecha que no corresponde al día del horario se rechaza", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const [schedule] = await createSchedule(token, disciplines.jump, [1]);
    expectError(
      await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedule.id, fecha: nextDate(2), cupo: 5 } }),
      422
    );
  });

  test("editar la hora del horario fijo mueve las fechas sin datos propios y respeta las guardadas", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const [schedule] = await createSchedule(token, disciplines.jump, [1]);
    const monday = nextDate(1, 7);
    await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedule.id, fecha: monday, cupo: 12 } });

    expectOk(await call(scheduleRoute.PUT, { token, method: "PUT", params: { id: schedule.id }, body: { horaInicio: "19:30" } }));

    const [stored] = await week(token, startOfWeekKey(monday));
    const [virtual] = await week(token, startOfWeekKey(addDaysToKey(monday, 7)));
    assert.equal(stored.horaInicio, "18:00");
    assert.equal(virtual.horaInicio, "19:30");
  });

  test("pausar un horario lo saca de las próximas semanas", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const [schedule] = await createSchedule(token, disciplines.jump, [1]);
    await call(scheduleRoute.PUT, { token, method: "PUT", params: { id: schedule.id }, body: { activo: false } });
    assert.equal((await week(token, startOfWeekKey(nextDate(1, 7)))).length, 0);
  });

  test("el rango de consulta tiene tope y el horario es privado de cada negocio", async () => {
    const { token } = await createBusiness();
    const other = await createBusiness();
    const { disciplines } = await createCatalog(other.token);
    const [schedule] = await createSchedule(other.token, disciplines.jump, [1]);

    expectError(await call(sessionsRoute.GET, { token, path: "/api/class-sessions?from=2026-01-01&to=2026-03-01" }), 422);
    expectError(await call(scheduleRoute.DELETE, { token, method: "DELETE", params: { id: schedule.id } }), 404);
    expectError(
      await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedule.id, fecha: nextDate(1), cupo: 1 } }),
      404
    );
    assert.equal(await prisma.classSession.count({ where: { scheduleId: schedule.id } }), 0);
  });
});
