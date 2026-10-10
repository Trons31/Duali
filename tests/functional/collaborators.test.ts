// Spec 024: colaboradores con acceso (administradores y socios) y sus permisos.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as collaboratorsRoute from "@/app/api/collaborators/route";
import * as collaboratorRoute from "@/app/api/collaborators/[id]/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import * as disciplinesRoute from "@/app/api/disciplines/route";
import * as salesRoute from "@/app/api/member-packages/route";
import * as instructorsRoute from "@/app/api/instructors/route";
import * as instructorRoute from "@/app/api/instructors/[id]/route";
import * as planRoute from "@/app/api/client/plan/route";
import * as registerRoute from "@/app/api/auth/register/route";
import { signToken } from "@/lib/auth";
import { addDaysToKey, studioTodayKey } from "@/lib/studio-time";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog, createMember } from "./studio-fixtures";

after(disconnect);

type Collaborator = { id: string; email: string; rol: string; activo: boolean; cantidadPermisos: number | null; permisos: Record<string, boolean> };

let counter = 0;
const email = (name: string) => `${name}-${Date.now()}-${(counter += 1)}@equipo.test`;

async function addCollaborator(token: string, body: Record<string, unknown>) {
  return expectOk<Collaborator>(
    await call(collaboratorsRoute.POST, {
      token,
      method: "POST",
      path: "/api/collaborators",
      body: { nombre: "Camila Admin", email: email("camila"), password: "Secreta123", rol: "ADMIN", ...body }
    }),
    201
  );
}

/** El token que recibe un colaborador al entrar: el negocio de la dueña + quién es. */
const tokenOf = (clientId: string, collaborator: Collaborator) => signToken({ id: clientId, email: collaborator.email }, collaborator.id);

const week = () => `/api/class-sessions?from=${studioTodayKey()}&to=${addDaysToKey(studioTodayKey(), 6)}`;

describe("spec 024 · crear colaboradores (R3)", () => {
  test("la dueña crea un administrador; Realizar pagos guarda también Ver pagos", async () => {
    const { token } = await createBusiness();
    const camila = await addCollaborator(token, { permisos: { HORARIO: true, HACER_PAGOS: true } });
    assert.equal(camila.rol, "ADMIN");
    assert.equal(camila.permisos.VER_PAGOS, true);
    assert.equal(camila.permisos.INICIO, true);
    assert.equal(camila.cantidadPermisos, 4);
    const list = expectOk<Collaborator[]>(await call(collaboratorsRoute.GET, { token, path: "/api/collaborators" }));
    assert.deepEqual(list.map((item) => item.id), [camila.id]);
  });

  test("correo único entre negocios y colaboradores; contraseña de 8 o más", async () => {
    const { token, client } = await createBusiness();
    const camila = await addCollaborator(token, {});
    expectError(
      await call(collaboratorsRoute.POST, { token, method: "POST", path: "/api/collaborators", body: { nombre: "Otra", email: camila.email, password: "Secreta123", rol: "ADMIN" } }),
      409
    );
    expectError(
      await call(collaboratorsRoute.POST, { token, method: "POST", path: "/api/collaborators", body: { nombre: "Otra", email: client.email, password: "Secreta123", rol: "ADMIN" } }),
      409
    );
    expectError(
      await call(collaboratorsRoute.POST, { token, method: "POST", path: "/api/collaborators", body: { nombre: "Otra", email: email("corta"), password: "123", rol: "ADMIN" } }),
      422
    );
    // Y nadie puede registrar un negocio con el correo de un colaborador.
    const register = await registerRoute.POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: "Intrusa", email: camila.email, password: "Secreta123", businessName: "Otro" })
      })
    );
    assert.equal(register.status, 409);
  });
});

describe("spec 024 · permisos en la API (R5)", () => {
  test("un administrador solo con Horario: ve el horario, no vende ni ve el plan ni el equipo", async () => {
    const { token, client } = await createBusiness();
    await createCatalog(token);
    const camila = await addCollaborator(token, { permisos: { HORARIO: true } });
    const asCamila = tokenOf(client.id, camila);

    expectOk(await call(sessionsRoute.GET, { token: asCamila, path: week() }));
    const member = await createMember(token, "Laura");
    const pkg = await prisma.package.findFirstOrThrow({ where: { clientId: client.id } });
    expectError(
      await call(salesRoute.POST, { token: asCamila, method: "POST", path: "/api/member-packages", body: { memberId: member.id, packageId: pkg.id } }),
      403,
      /permiso/
    );
    expectError(await call(planRoute.GET, { token: asCamila, path: "/api/client/plan" }), 403);
    expectError(await call(collaboratorsRoute.GET, { token: asCamila, path: "/api/collaborators" }), 403);
    expectError(
      await call(collaboratorRoute.PUT, {
        token: asCamila,
        method: "PUT",
        path: `/api/collaborators/${camila.id}`,
        params: { id: camila.id },
        body: { nombre: "Camila", email: camila.email, rol: "SOCIO" }
      }),
      403
    );
  });

  test("lo que crea un administrador queda en el negocio de la dueña", async () => {
    const { token, client } = await createBusiness();
    const camila = await addCollaborator(token, { permisos: { PAQUETES: true } });
    const created = expectOk<{ id: string }>(
      await call(disciplinesRoute.POST, { token: tokenOf(client.id, camila), method: "POST", path: "/api/disciplines", body: { nombre: "Yoga", color: "#14b87e" } }),
      201
    );
    assert.equal((await prisma.discipline.findUniqueOrThrow({ where: { id: created.id } })).clientId, client.id);
  });

  test("Ver instructores no deja editarlos; el socio sí, pero no crea colaboradores", async () => {
    const { token, client } = await createBusiness();
    const laura = expectOk<{ id: string }>(
      await call(instructorsRoute.POST, { token, method: "POST", path: "/api/instructors", body: { nombre: "Laura", sueldo: 900000 } }),
      201
    );
    const viewer = tokenOf(client.id, await addCollaborator(token, { permisos: { VER_COLABORADORES: true } }));
    const partner = tokenOf(client.id, await addCollaborator(token, { rol: "SOCIO" }));
    const edit = { nombre: "Laura", apellido: "Ríos", sueldo: 950000 };

    expectOk(await call(instructorsRoute.GET, { token: viewer, path: "/api/instructors" }));
    expectError(await call(instructorRoute.PUT, { token: viewer, method: "PUT", path: `/api/instructors/${laura.id}`, params: { id: laura.id }, body: edit }), 403);
    expectOk(await call(instructorRoute.PUT, { token: partner, method: "PUT", path: `/api/instructors/${laura.id}`, params: { id: laura.id }, body: edit }));
    expectError(
      await call(collaboratorsRoute.POST, { token: partner, method: "POST", path: "/api/collaborators", body: { nombre: "X", email: email("x"), password: "Secreta123", rol: "ADMIN" } }),
      403
    );
    expectError(await call(planRoute.GET, { token: partner, path: "/api/client/plan" }), 403);
  });
});

describe("spec 024 · desactivar (R7)", () => {
  test("desactivado pierde el acceso en la siguiente petición; reactivado vuelve", async () => {
    const { token, client } = await createBusiness();
    const camila = await addCollaborator(token, { permisos: { HORARIO: true } });
    const asCamila = tokenOf(client.id, camila);
    expectOk(await call(sessionsRoute.GET, { token: asCamila, path: week() }));

    const off = expectOk<Collaborator>(await call(collaboratorRoute.DELETE, { token, method: "DELETE", path: `/api/collaborators/${camila.id}`, params: { id: camila.id } }));
    assert.equal(off.activo, false);
    expectError(await call(sessionsRoute.GET, { token: asCamila, path: week() }), 401, /desactivado/);

    expectOk(
      await call(collaboratorRoute.PUT, {
        token,
        method: "PUT",
        path: `/api/collaborators/${camila.id}`,
        params: { id: camila.id },
        body: { nombre: "Camila", email: camila.email, rol: "ADMIN", permisos: { HORARIO: true }, activo: true }
      })
    );
    expectOk(await call(sessionsRoute.GET, { token: asCamila, path: week() }));
  });

  test("un colaborador de otro negocio no puede usar su token aquí", async () => {
    const { token } = await createBusiness();
    const other = await createBusiness();
    const camila = await addCollaborator(token, { rol: "SOCIO" });
    // Token armado con el negocio equivocado.
    expectError(await call(sessionsRoute.GET, { token: tokenOf(other.client.id, camila), path: week() }), 401);
  });
});
