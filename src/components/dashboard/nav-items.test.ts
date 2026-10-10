import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getNavSections } from "@/components/dashboard/nav-items";
import { normalizePermissions } from "@/lib/collaborator-permissions";

const titles = (modules: { moduloAcademia: boolean; moduloEstudio: boolean }) =>
  getNavSections(modules).map((section) => section.title);

describe("menú por módulos (spec 002 R4)", () => {
  test("un negocio existente (solo Academia) ve lo de siempre", () => {
    assert.deepEqual(titles({ moduloAcademia: true, moduloEstudio: false }), [
      "PRINCIPAL",
      "ACADEMIA",
      "COBROS",
      "FINANZAS",
      "CUENTA"
    ]);
  });

  test("solo Estudio oculta ACADEMIA y COBROS", () => {
    assert.deepEqual(titles({ moduloAcademia: false, moduloEstudio: true }), [
      "PRINCIPAL",
      "AGENDA",
      "VENTAS",
      "EQUIPO",
      "MI PÁGINA",
      "FINANZAS",
      "CUENTA"
    ]);
  });

  test("con ambos módulos aparece todo", () => {
    const all = titles({ moduloAcademia: true, moduloEstudio: true });
    for (const title of ["AGENDA", "ACADEMIA", "VENTAS", "EQUIPO", "COBROS"]) assert.ok(all.includes(title), title);
  });

  test("CUENTA: Ajustes primero y luego Mi Plan, como en CliqCut (spec 001)", () => {
    const cuenta = getNavSections({ moduloAcademia: true, moduloEstudio: false }).find((section) => section.title === "CUENTA");
    assert.deepEqual(
      cuenta?.items.map((item) => [item.label, item.href]),
      [
        ["Ajustes", "/dashboard/ajustes"],
        ["Mi Plan", "/dashboard/mi-plan"]
      ]
    );
  });

  test("Estudiantes se muestra como Alumnos sin cambiar la ruta", () => {
    const academia = getNavSections({ moduloAcademia: true, moduloEstudio: false }).find((section) => section.title === "ACADEMIA");
    assert.deepEqual(academia?.items[0], { ...academia?.items[0], label: "Alumnos", href: "/dashboard/estudiantes" });
  });

  test("spec 024: un administrador solo ve lo que tiene permitido y nunca Mi Plan", () => {
    const access = { kind: "COLLABORATOR" as const, role: "ADMIN" as const, permissions: normalizePermissions({ HORARIO: true, VER_PAGOS: true }) };
    const items = getNavSections({ moduloAcademia: true, moduloEstudio: true }, access).flatMap((section) => section.items.map((item) => item.label));
    assert.deepEqual(items, ["Inicio", "Notificaciones", "Horario de clases", "Pagos"]);
  });

  test("spec 024: el socio ve todo menos Mi Plan", () => {
    const access = { kind: "COLLABORATOR" as const, role: "SOCIO" as const, permissions: normalizePermissions({}) };
    const items = getNavSections({ moduloAcademia: false, moduloEstudio: true }, access).flatMap((section) => section.items.map((item) => item.href));
    assert.ok(items.includes("/dashboard/colaboradores"));
    assert.ok(items.includes("/dashboard/contabilidad"));
    assert.equal(items.includes("/dashboard/mi-plan"), false);
  });
});
