// Spec 023 fase 1: instructores, titular del horario y reemplazos por fecha.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as instructorsRoute from "@/app/api/instructors/route";
import * as instructorRoute from "@/app/api/instructors/[id]/route";
import * as importRoute from "@/app/api/instructors/import/route";
import * as schedulesRoute from "@/app/api/class-schedules/route";
import * as scheduleRoute from "@/app/api/class-schedules/[id]/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import { call, createBusiness, disconnect, expectError, expectOk } from "./helpers";
import { createCatalog, createSchedule, nextDate } from "./studio-fixtures";

after(disconnect);

type Instructor = {
  id: string;
  nombreCompleto: string;
  activo: boolean;
  pagoConfigurado: boolean;
  descripcionPago: string;
  disciplinas: Array<{ id: string; valor: number | null }>;
  horarios: number;
};
type Session = {
  scheduleId: string;
  fecha: string;
  instructor: string | null;
  instructorId: string | null;
  reemplazo: boolean;
  titularId: string | null;
  titular: string | null;
};

async function createInstructor(token: string, body: Record<string, unknown>) {
  return expectOk<Instructor>(await call(instructorsRoute.POST, { token, method: "POST", body }), 201);
}

async function scheduleWith(token: string, disciplineId: string, instructorId: string | null, instructor?: string) {
  const [schedule] = expectOk<Array<{ id: string; instructor: string | null; instructorId: string | null }>>(
    await call(schedulesRoute.POST, {
      token,
      method: "POST",
      body: { disciplineId, dias: [3], horaInicio: "07:00", duracionMin: 60, cupo: 10, instructorId, instructor }
    }),
    201
  );
  return schedule;
}

async function sessionOn(token: string, scheduleId: string, fecha: string) {
  const sessions = expectOk<Session[]>(await call(sessionsRoute.GET, { token, path: `/api/class-sessions?from=${fecha}&to=${fecha}` }));
  return sessions.find((item) => item.scheduleId === scheduleId)!;
}

describe("spec 023 · instructores", () => {
  test("R1: se registra con su forma de pago y valor propio por disciplina", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const laura = await createInstructor(token, {
      nombre: "Laura",
      apellido: "Pérez",
      variable: "ALUMNO_FIJO",
      valor: 6000,
      minimoPorClase: 30000,
      disciplinas: [{ disciplineId: disciplines.bodyCombat, valor: 8000 }, { disciplineId: disciplines.rumba }]
    });
    assert.equal(laura.nombreCompleto, "Laura Pérez");
    assert.equal(laura.descripcionPago, "$6.000 por alumno · mín. $30.000 por clase");
    assert.deepEqual(
      laura.disciplinas.map((item) => item.valor).sort(),
      [8000, null].sort()
    );

    const list = expectOk<Instructor[]>(await call(instructorsRoute.GET, { token }));
    assert.deepEqual(list.map((item) => item.id), [laura.id]);
  });

  test("R1: pide cómo se le paga, no deja un % mayor a 100 ni disciplinas de otro negocio", async () => {
    const { token } = await createBusiness();
    const other = await createBusiness();
    const foreign = await createCatalog(other.token);
    expectError(await call(instructorsRoute.POST, { token, method: "POST", body: { nombre: "Ana" } }), 422);
    expectError(
      await call(instructorsRoute.POST, { token, method: "POST", body: { nombre: "Ana", variable: "ALUMNO_PORCENTAJE", valor: 140 } }),
      422
    );
    expectError(
      await call(instructorsRoute.POST, {
        token,
        method: "POST",
        body: { nombre: "Ana", sueldo: 1200000, disciplinas: [{ disciplineId: foreign.disciplines.rumba }] }
      }),
      422,
      /disciplina/i
    );
  });

  test("R1: sin horarios se elimina; con horarios solo se desactiva", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const free = await createInstructor(token, { nombre: "Sofía", sueldo: 900000 });
    const busy = await createInstructor(token, { nombre: "Andrés", variable: "POR_CLASE", valor: 35000 });
    await scheduleWith(token, disciplines.bodyCombat, busy.id);

    assert.equal(expectOk<{ resultado: string }>(await call(instructorRoute.DELETE, { token, method: "DELETE", params: { id: free.id } })).resultado, "ELIMINADO");
    assert.equal(expectOk<{ resultado: string }>(await call(instructorRoute.DELETE, { token, method: "DELETE", params: { id: busy.id } })).resultado, "DESACTIVADO");

    const list = expectOk<Instructor[]>(await call(instructorsRoute.GET, { token }));
    assert.deepEqual(list.map((item) => [item.id, item.activo]), [[busy.id, false]]);
  });

  test("R3: los nombres escritos a mano se registran y quedan como titulares", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    await scheduleWith(token, disciplines.bodyCombat, null, "Ana Gómez");
    await scheduleWith(token, disciplines.rumba, null, "ana gomez ");

    assert.deepEqual(expectOk<string[]>(await call(importRoute.GET, { token })), ["Ana Gómez"]);
    assert.deepEqual(expectOk(await call(importRoute.POST, { token, method: "POST" })), { creados: 1, enlazados: 1 });
    assert.deepEqual(expectOk<string[]>(await call(importRoute.GET, { token })), []);

    const [ana] = expectOk<Instructor[]>(await call(instructorsRoute.GET, { token }));
    assert.equal(ana.nombreCompleto, "Ana Gómez");
    assert.equal(ana.pagoConfigurado, false);
    assert.equal(ana.horarios, 2);
    assert.deepEqual(ana.disciplinas.map((item) => item.id).sort(), [disciplines.bodyCombat, disciplines.rumba].sort());
  });
});

describe("spec 023 · titular y reemplazos (D5)", () => {
  test("R4/R5: el titular pone su nombre en el horario y lo actualiza si cambia", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const laura = await createInstructor(token, { nombre: "Laura", variable: "POR_CLASE", valor: 35000 });
    const schedule = await scheduleWith(token, disciplines.bodyCombat, laura.id, "otro texto");
    assert.equal(schedule.instructor, "Laura");
    assert.equal(schedule.instructorId, laura.id);

    expectOk(
      await call(instructorRoute.PUT, {
        token,
        method: "PUT",
        params: { id: laura.id },
        body: { nombre: "Laura", apellido: "Ríos", variable: "POR_CLASE", valor: 35000 }
      })
    );
    const session = await sessionOn(token, schedule.id, nextDate(3));
    assert.equal(session.instructor, "Laura Ríos");
    assert.equal(session.reemplazo, false);

    // Sin asignar borra los dos.
    const cleared = expectOk<{ instructor: string | null; instructorId: string | null }>(
      await call(scheduleRoute.PUT, { token, method: "PUT", params: { id: schedule.id }, body: { instructorId: null, instructor: null } })
    );
    assert.deepEqual([cleared.instructor, cleared.instructorId], [null, null]);
  });

  test("R4: un reemplazo cambia solo esa fecha; elegir al titular lo quita", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const laura = await createInstructor(token, { nombre: "Laura", variable: "POR_CLASE", valor: 35000 });
    const andres = await createInstructor(token, { nombre: "Andrés", variable: "POR_CLASE", valor: 30000 });
    const schedule = await scheduleWith(token, disciplines.bodyCombat, laura.id);
    const fecha = nextDate(3);
    const nextWeek = nextDate(3, 9);

    expectOk(await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedule.id, fecha, instructorId: andres.id } }));
    const replaced = await sessionOn(token, schedule.id, fecha);
    assert.deepEqual(
      [replaced.instructor, replaced.instructorId, replaced.reemplazo, replaced.titularId, replaced.titular],
      ["Andrés", andres.id, true, laura.id, "Laura"]
    );
    assert.equal((await sessionOn(token, schedule.id, nextWeek)).instructorId, laura.id);

    expectOk(await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedule.id, fecha, instructorId: laura.id } }));
    const back = await sessionOn(token, schedule.id, fecha);
    assert.deepEqual([back.instructorId, back.reemplazo], [laura.id, false]);
  });

  test("D5: no se asigna a alguien inactivo ni de otro negocio", async () => {
    const { token } = await createBusiness();
    const other = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const outsider = await createInstructor(other.token, { nombre: "Mario", sueldo: 1000000 });
    const inactive = await createInstructor(token, { nombre: "Paula", sueldo: 1000000, activo: false });
    const schedule = await createSchedule(token, disciplines.bodyCombat, [3]);
    const fecha = nextDate(3);

    for (const instructorId of [outsider.id, inactive.id]) {
      expectError(await call(sessionsRoute.PUT, { token, method: "PUT", body: { scheduleId: schedule[0].id, fecha, instructorId } }), 422);
      expectError(
        await call(scheduleRoute.PUT, { token, method: "PUT", params: { id: schedule[0].id }, body: { instructorId } }),
        422
      );
    }
  });
});
