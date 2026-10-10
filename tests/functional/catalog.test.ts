// Specs 002, 003 y 004: modulos del negocio, disciplinas, combos y paquetes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { after, describe, test } from "node:test";
import * as profileRoute from "@/app/api/client/profile/route";
import * as disciplinesRoute from "@/app/api/disciplines/route";
import * as disciplineRoute from "@/app/api/disciplines/[id]/route";
import * as packagesRoute from "@/app/api/packages/route";
import * as packageRoute from "@/app/api/packages/[id]/route";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog } from "./studio-fixtures";

after(disconnect);

describe("spec 002 · módulos del negocio", () => {
  test("un negocio nuevo queda solo con Academia, como los existentes", async () => {
    const client = await prisma.client.create({
      data: { nombre: "Viejo", email: `viejo-${Date.now()}@test.duali`, passwordHash: "x", businessName: "Academia" }
    });
    assert.equal(client.moduloAcademia, true);
    assert.equal(client.moduloEstudio, false);
    assert.equal(client.horasCancelacion, 2);
  });

  test("el perfil devuelve y guarda los módulos", async () => {
    const { token } = await createBusiness({ moduloEstudio: false });
    const profile = expectOk<{ moduloAcademia: boolean; moduloEstudio: boolean }>(await call(profileRoute.GET, { token }));
    assert.deepEqual([profile.moduloAcademia, profile.moduloEstudio], [true, false]);

    const updated = expectOk<{ moduloAcademia: boolean; moduloEstudio: boolean }>(
      await call(profileRoute.PUT, { token, method: "PUT", body: { moduloAcademia: false, moduloEstudio: true } })
    );
    assert.deepEqual([updated.moduloAcademia, updated.moduloEstudio], [false, true]);
  });

  test("no se pueden apagar los dos módulos, ni en dos pasos", async () => {
    const { token } = await createBusiness({ moduloEstudio: false });
    expectError(await call(profileRoute.PUT, { token, method: "PUT", body: { moduloAcademia: false, moduloEstudio: false } }), 422);
    // Solo Academia activa: apagarla sola deja el negocio sin módulos.
    expectError(await call(profileRoute.PUT, { token, method: "PUT", body: { moduloAcademia: false } }), 422, /al menos un módulo/);
  });

  test("guardar otros datos del perfil no toca los módulos", async () => {
    const { token } = await createBusiness({ moduloAcademia: false, moduloEstudio: true });
    const updated = expectOk<{ moduloAcademia: boolean; moduloEstudio: boolean; telefono: string }>(
      await call(profileRoute.PUT, { token, method: "PUT", body: { telefono: "3001112233" } })
    );
    assert.deepEqual([updated.moduloAcademia, updated.moduloEstudio, updated.telefono], [false, true, "3001112233"]);
  });
});

describe("spec 003 · disciplinas y combos", () => {
  test("crear las disciplinas del menú y el combo Mix Studio con las tres", async () => {
    const { token } = await createBusiness();
    const catalog = await createCatalog(token);
    const list = expectOk<Array<{ id: string; tipo: string; incluye: Array<{ id: string }> }>>(
      await call(disciplinesRoute.GET, { token })
    );
    assert.equal(list.length, 4);
    const mix = list.find((item) => item.id === catalog.disciplines.mix)!;
    assert.equal(mix.tipo, "COMBO");
    assert.equal(mix.incluye.length, 3);
  });

  test("el nombre no se repite (sin importar mayúsculas)", async () => {
    const { token } = await createBusiness();
    await createCatalog(token);
    expectError(
      await call(disciplinesRoute.POST, { token, method: "POST", body: { nombre: "body combat", color: "#14b87e" } }),
      409
    );
  });

  test("un combo necesita al menos 2 clases y no puede incluir otro combo", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    expectError(
      await call(disciplinesRoute.POST, {
        token,
        method: "POST",
        body: { tipo: "COMBO", nombre: "Solo uno", color: "#14b87e", incluyeIds: [disciplines.jump] }
      }),
      422,
      /al menos 2/
    );
    expectError(
      await call(disciplinesRoute.POST, {
        token,
        method: "POST",
        body: { tipo: "COMBO", nombre: "Combo de combo", color: "#14b87e", incluyeIds: [disciplines.jump, disciplines.mix] }
      }),
      422
    );
  });

  test("no se puede usar una disciplina de otro negocio", async () => {
    const { token } = await createBusiness();
    const other = await createBusiness();
    const { disciplines } = await createCatalog(other.token);
    const mine = await createCatalog(token);
    expectError(
      await call(disciplinesRoute.POST, {
        token,
        method: "POST",
        body: { tipo: "COMBO", nombre: "Robado", color: "#14b87e", incluyeIds: [mine.disciplines.jump, disciplines.jump] }
      }),
      422
    );
    expectError(await call(disciplineRoute.DELETE, { token, method: "DELETE", params: { id: disciplines.jump } }), 404);
  });

  test("no se borra una disciplina que está en un combo o tiene paquetes", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    expectError(await call(disciplineRoute.DELETE, { token, method: "DELETE", params: { id: disciplines.jump } }), 409, /paquete/);

    // Sin paquetes pero dentro del combo:
    const extra = expectOk<{ id: string }>(
      await call(disciplinesRoute.POST, { token, method: "POST", body: { nombre: "Yoga", color: "#14b87e" } }),
      201
    );
    await call(disciplineRoute.PUT, {
      token,
      method: "PUT",
      params: { id: disciplines.mix },
      body: { incluyeIds: [disciplines.bodyCombat, extra.id] }
    });
    expectError(await call(disciplineRoute.DELETE, { token, method: "DELETE", params: { id: extra.id } }), 409, /combo/);
    expectError(
      await call(disciplineRoute.PUT, { token, method: "PUT", params: { id: extra.id }, body: { activa: false } }),
      409,
      /combo/
    );
  });

  test("editar solo el nombre no borra la descripción", async () => {
    const { token } = await createBusiness();
    const created = expectOk<{ id: string }>(
      await call(disciplinesRoute.POST, {
        token,
        method: "POST",
        body: { nombre: "Yoga", color: "#14b87e", descripcion: "Relajación" }
      }),
      201
    );
    const updated = expectOk<{ nombre: string; descripcion: string }>(
      await call(disciplineRoute.PUT, { token, method: "PUT", params: { id: created.id }, body: { nombre: "Yoga flow" } })
    );
    assert.deepEqual([updated.nombre, updated.descripcion], ["Yoga flow", "Relajación"]);
  });

  test("borrar una disciplina libre es lógico: desaparece de la lista pero queda en la base", async () => {
    const { token } = await createBusiness();
    const created = expectOk<{ id: string }>(
      await call(disciplinesRoute.POST, { token, method: "POST", body: { nombre: "Pilates", color: "#14b87e" } }),
      201
    );
    assert.equal((await call(disciplineRoute.DELETE, { token, method: "DELETE", params: { id: created.id } })).status, 204);
    const list = expectOk<Array<{ id: string }>>(await call(disciplinesRoute.GET, { token }));
    assert.equal(list.some((item) => item.id === created.id), false);
    assert.ok((await prisma.discipline.findUnique({ where: { id: created.id } }))?.deletedAt);
  });
});

describe("spec 004 · paquetes y precios", () => {
  test("un paquete para varias disciplinas en un paso; editar uno no toca los otros", async () => {
    const { token } = await createBusiness();
    const { packages } = await createCatalog(token);
    expectOk(
      await call(packageRoute.PUT, { token, method: "PUT", params: { id: packages.basicoRumba }, body: { precio: 58000 } })
    );
    const list = expectOk<Array<{ id: string; precio: string }>>(await call(packagesRoute.GET, { token }));
    assert.equal(Number(list.find((item) => item.id === packages.basicoRumba)!.precio), 58000);
    assert.equal(Number(list.find((item) => item.id === packages.basicoBodyCombat)!.precio), 55000);
  });

  test("no se repite el nombre del paquete dentro de una disciplina", async () => {
    const { token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    expectError(
      await call(packagesRoute.POST, {
        token,
        method: "POST",
        body: { nombre: "básico", clases: 4, precio: 1, disciplineIds: [disciplines.jump] }
      }),
      409,
      /Jump Power/
    );
  });

  test("no se crean paquetes para disciplinas inactivas", async () => {
    const { token } = await createBusiness();
    const created = expectOk<{ id: string }>(
      await call(disciplinesRoute.POST, { token, method: "POST", body: { nombre: "Pilates", color: "#14b87e" } }),
      201
    );
    await call(disciplineRoute.PUT, { token, method: "PUT", params: { id: created.id }, body: { activa: false } });
    expectError(
      await call(packagesRoute.POST, {
        token,
        method: "POST",
        body: { nombre: "Básico", clases: 4, precio: 1, disciplineIds: [created.id] }
      }),
      422
    );
  });

  test("el script de carga crea 3 disciplinas, 1 combo y 19 paquetes, y es idempotente", async () => {
    const { client } = await createBusiness();
    const run = (...args: string[]) =>
      execFileSync(process.execPath, ["--import", "tsx", path.join("scripts", "seed-studio-catalog.ts"), "--email", client.email, ...args], {
        env: { ...process.env },
        encoding: "utf8"
      });

    const dryRun = run();
    assert.match(dryRun, /SIMULACION/);
    assert.equal(await prisma.discipline.count({ where: { clientId: client.id } }), 0, "la simulación no escribe");

    run("--apply", "--activar-modulo");
    run("--apply");

    const disciplines = await prisma.discipline.findMany({ where: { clientId: client.id } });
    assert.equal(disciplines.filter((item) => item.tipo === "CLASE").length, 3);
    assert.equal(disciplines.filter((item) => item.tipo === "COMBO").length, 1);
    assert.equal(await prisma.package.count({ where: { clientId: client.id } }), 19);

    const jumpPlus = await prisma.package.findFirst({
      where: { clientId: client.id, nombre: "Plus", discipline: { nombre: "Jump Power" } }
    });
    assert.equal(Number(jumpPlus?.precio), 130000);
    assert.equal((await prisma.client.findUnique({ where: { id: client.id } }))?.moduloEstudio, true);
  });
});
