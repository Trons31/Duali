import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getNavSections } from "@/components/dashboard/nav-items";

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
      "MI PÁGINA",
      "FINANZAS",
      "CUENTA"
    ]);
  });

  test("con ambos módulos aparece todo", () => {
    const all = titles({ moduloAcademia: true, moduloEstudio: true });
    for (const title of ["AGENDA", "ACADEMIA", "VENTAS", "COBROS"]) assert.ok(all.includes(title), title);
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
});
