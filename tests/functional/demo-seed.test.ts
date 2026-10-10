// Spec 016 R3: estudio demo con el catalogo de las historias de Studio Dance,
// sobre un usuario demo que ya existe (como demo@gmail.com en la base real).
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import * as packagesRoute from "@/app/api/packages/route";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import { DEMO_EMAIL, seedDemoStudio } from "../../scripts/demo-studio";
import { getPublishedStudio } from "@/lib/public-studio";
import { call, createBusiness, disconnect, expectOk, prisma } from "./helpers";
import { createSchedule } from "./studio-fixtures";
import * as disciplinesRoute from "@/app/api/disciplines/route";

after(disconnect);

const quiet = () => undefined;

async function counts(clientId: string) {
  const [disciplinas, paquetes, horarios, clientes, ventas, reservas] = await Promise.all([
    prisma.discipline.count({ where: { clientId } }),
    prisma.package.count({ where: { clientId } }),
    prisma.classSchedule.count({ where: { clientId } }),
    prisma.studioMember.count({ where: { clientId } }),
    prisma.memberPackage.count({ where: { clientId } }),
    prisma.booking.count({ where: { clientId } })
  ]);
  return { disciplinas, paquetes, horarios, clientes, ventas, reservas };
}

/** Lo que tenia el demo real: Body Combat, Individual a $50.000 y clases de lunes a viernes. */
async function existingDemo() {
  const business = await createBusiness({ moduloAcademia: false });
  await prisma.client.update({ where: { id: business.client.id }, data: { email: DEMO_EMAIL } });
  const bodyCombat = expectOk<{ id: string }>(
    await call(disciplinesRoute.POST, { token: business.token, method: "POST", body: { nombre: "Body Combat", color: "#14b87e" } }),
    201
  );
  expectOk(
    await call(packagesRoute.POST, {
      token: business.token,
      method: "POST",
      body: { nombre: "Individual", clases: 1, precio: 50_000, disciplineIds: [bodyCombat.id] }
    }),
    201
  );
  await createSchedule(business.token, bodyCombat.id, [1, 2, 3, 4, 5], { cupo: 15 });
  expectOk(await call(publicPageRoute.PUT, { token: business.token, method: "PUT", body: { slug: "demo-prueba", paginaPublicaActiva: true } }));
  return business.client;
}

describe("spec 016 · seed del estudio demo", () => {
  test("sin el usuario demo falla y no crea ninguno", async () => {
    await assert.rejects(seedDemoStudio({ apply: true, email: "no-existe@test.duali", log: quiet }), /No existe/);
    assert.equal(await prisma.client.count({ where: { email: "no-existe@test.duali" } }), 0);
  });

  test("sobre el demo existente: en simulación no escribe; al aplicar completa el catálogo con los precios exactos y no duplica", async () => {
    const client = await existingDemo();
    const before = await counts(client.id);
    await seedDemoStudio({ apply: false, log: quiet });
    assert.deepEqual(await counts(client.id), before, "la simulación no escribe");

    await seedDemoStudio({ apply: true, log: quiet });
    assert.ok(await getPublishedStudio("demo-prueba"), "conserva su página");

    const packages = await prisma.package.findMany({
      where: { clientId: client.id },
      select: { nombre: true, clases: true, precio: true, discipline: { select: { nombre: true } } }
    });
    const price = (disciplina: string, nombre: string) => {
      const item = packages.find((row) => row.discipline.nombre === disciplina && row.nombre === nombre);
      return item ? [item.clases, Number(item.precio)] : null;
    };
    assert.deepEqual(price("Body Combat", "Individual"), [1, 15_000], "el $50.000 que tenía pasa al precio de la historia");
    assert.deepEqual(price("Body Combat", "Full Studiodance"), [20, 270_000]);
    assert.deepEqual(price("Rumba Fit", "Plus"), [8, 110_000]);
    assert.deepEqual(price("Jump Power", "Individual"), [1, 18_000]);
    assert.deepEqual(price("Jump Power", "Premium"), [12, 180_000]);
    assert.deepEqual(price("Jump Power", "Full Studiodance"), [20, 320_000]);
    assert.deepEqual(price("Mix Studio", "Básico"), [4, 60_000]);
    assert.deepEqual(price("Mix Studio", "Full Studiodance"), [20, 290_000]);
    assert.equal(price("Mix Studio", "Individual"), null, "Mix Studio no tiene Individual");

    const mix = await prisma.discipline.findFirstOrThrow({
      where: { clientId: client.id, nombre: "Mix Studio" },
      include: { comboItems: { include: { discipline: { select: { nombre: true } } } } }
    });
    assert.equal(mix.tipo, "COMBO");
    assert.deepEqual(mix.comboItems.map((item) => item.discipline.nombre).sort(), ["Body Combat", "Jump Power", "Rumba Fit"]);

    // Body Combat conserva su horario (5); se agregan Jump Power (5) y Rumba Fit (3).
    const first = await counts(client.id);
    assert.deepEqual({ ...first, reservas: first.reservas > 0 }, {
      disciplinas: 4,
      paquetes: 19,
      horarios: 13,
      clientes: 6,
      ventas: 5,
      reservas: true
    });
    const bodyCombatSchedules = await prisma.classSchedule.findMany({ where: { clientId: client.id, discipline: { nombre: "Body Combat" } } });
    assert.deepEqual(bodyCombatSchedules.map((row) => row.diaSemana).sort(), [1, 2, 3, 4, 5]);

    const saldo = async (nombre: string) => {
      const sale = await prisma.memberPackage.findFirstOrThrow({ where: { clientId: client.id, member: { nombre } } });
      return Number(sale.precio) - Number(sale.pagado);
    };
    assert.equal(await saldo("Valentina"), 60_000);
    assert.equal(await saldo("Camila"), 15_000);
    assert.equal(await saldo("Laura"), 0);

    await seedDemoStudio({ apply: true, log: quiet });
    assert.deepEqual(await counts(client.id), first, "segunda corrida sin duplicar");
  });
});
