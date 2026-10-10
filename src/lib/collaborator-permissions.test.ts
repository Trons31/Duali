import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  allows,
  canSeePage,
  normalizePermissions,
  requirementForApi,
  type Access
} from "@/lib/collaborator-permissions";

const admin = (permisos: Record<string, boolean>): Access => ({ kind: "COLLABORATOR", role: "ADMIN", permissions: normalizePermissions(permisos) });
const socio: Access = { kind: "COLLABORATOR", role: "SOCIO", permissions: normalizePermissions({}) };

describe("permisos de colaboradores (spec 024 D4)", () => {
  test("Inicio siempre; Realizar pagos incluye Ver pagos; Editar ajustes incluye Ver ajustes", () => {
    const permissions = normalizePermissions({ HACER_PAGOS: true, EDITAR_AJUSTES: true, INVENTADO: true });
    assert.equal(permissions.INICIO, true);
    assert.equal(permissions.VER_PAGOS, true);
    assert.equal(permissions.VER_AJUSTES, true);
    assert.equal("INVENTADO" in permissions, false);
  });

  test("un administrador solo con Horario: horario sí, ventas y contabilidad no", () => {
    const access = admin({ HORARIO: true });
    assert.ok(allows(access, requirementForApi("/api/class-sessions", "PUT")));
    assert.ok(allows(access, requirementForApi("/api/disciplines", "GET")), "lecturas compartidas");
    assert.ok(allows(access, requirementForApi("/api/instructors", "GET")), "lista para elegir titular");
    assert.equal(allows(access, requirementForApi("/api/member-packages", "POST")), false);
    assert.equal(allows(access, requirementForApi("/api/accounting/overview", "GET")), false);
    assert.equal(allows(access, requirementForApi("/api/disciplines", "POST")), false);
    assert.ok(canSeePage(access, "/dashboard/horario"));
    assert.equal(canSeePage(access, "/dashboard/clientes/abc"), false);
  });

  test("Ver instructores no deja editarlos; el socio sí; nadie más que la dueña toca el plan o el equipo", () => {
    const viewer = admin({ VER_COLABORADORES: true });
    assert.ok(allows(viewer, requirementForApi("/api/instructors/abc", "GET")));
    assert.equal(allows(viewer, requirementForApi("/api/instructors/abc", "PUT")), false);
    assert.ok(allows(socio, requirementForApi("/api/instructors/abc", "PUT")));
    for (const access of [viewer, socio]) {
      assert.equal(allows(access, requirementForApi("/api/collaborators", "POST")), false);
      assert.equal(allows(access, requirementForApi("/api/client/plan", "GET")), false);
      assert.equal(canSeePage(access, "/dashboard/mi-plan"), false);
    }
    assert.ok(canSeePage(socio, "/dashboard/contabilidad"));
  });

  test("pagos a instructores: ver no deja pagar ni anular", () => {
    const viewer = admin({ VER_PAGOS: true });
    assert.ok(allows(viewer, requirementForApi("/api/instructor-payments", "GET")));
    assert.ok(allows(viewer, requirementForApi("/api/instructor-payments/abc", "GET")));
    assert.equal(allows(viewer, requirementForApi("/api/instructor-payments/pay", "POST")), false);
    assert.equal(allows(viewer, requirementForApi("/api/instructor-payments/abc", "DELETE")), false);
    assert.ok(allows(admin({ HACER_PAGOS: true }), requirementForApi("/api/instructor-payments/pay", "POST")));
  });
});

/** Rutas que son solo de la dueña a propósito (D3): su plan y su equipo. */
const OWNER_ONLY = new Set(["client/plan", "client/plan/cancel", "collaborators", "collaborators/[id]"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("mapa ruta → permiso (spec 024 R5)", () => {
  test("toda ruta del negocio está en el mapa o es solo de la dueña a propósito", () => {
    const root = path.join(process.cwd(), "src", "app", "api");
    const missing: string[] = [];
    for (const file of routeFiles(root)) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("requireClient(")) continue;
      const route = path.relative(root, path.dirname(file)).split(path.sep).join("/");
      const sample = `/api/${route.replace(/\[[^\]]+\]/g, "x")}`;
      for (const [, method] of source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)) {
        const need = requirementForApi(sample, method);
        if (OWNER_ONLY.has(route)) {
          if (need !== "DUENA") missing.push(`${method} ${route} debería ser solo de la dueña`);
        } else if (need === "DUENA") {
          missing.push(`${method} ${route}`);
        }
      }
    }
    assert.deepEqual(missing, [], "Agrega estas rutas a API_RULES o a OWNER_ONLY");
  });
});
