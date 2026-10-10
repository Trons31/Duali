import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { namesMatch, slugProblem, suggestSlug } from "@/lib/studio-constants";

describe("dirección pública (spec 008 R1)", () => {
  test("sugiere un slug a partir del nombre del negocio", () => {
    assert.equal(suggestSlug("Studio Dance Col!"), "studio-dance-col");
    assert.equal(suggestSlug("  Academia Ñandú  "), "academia-nandu");
    assert.equal(suggestSlug("A"), "a-duali");
    assert.equal(suggestSlug("!!!"), "estudio-duali");
    assert.equal(suggestSlug("x".repeat(60)).length, 40);
  });

  test("toda sugerencia es un slug válido", () => {
    for (const name of ["Studio Dance Col!", "A", "!!!", "Pilates & Yoga — Medellín", "x".repeat(60), "a-".repeat(30)]) {
      assert.equal(slugProblem(suggestSlug(name)), null, name);
    }
  });

  test("rechaza formatos inválidos y palabras reservadas", () => {
    assert.equal(slugProblem("studiodance"), null);
    assert.equal(slugProblem("studio-dance-2"), null);
    assert.ok(slugProblem("Mi Estudio!"));
    assert.ok(slugProblem("ab"));
    assert.ok(slugProblem("-studio"));
    assert.ok(slugProblem("studio-"));
    assert.ok(slugProblem("studio--dance"));
    assert.ok(slugProblem("x".repeat(41)));
    assert.match(slugProblem("admin") ?? "", /reservada/);
    assert.match(slugProblem("dashboard") ?? "", /reservada/);
  });
});

describe("coincidencia de nombre sin contraseña (spec 009)", () => {
  test("basta el primer nombre, sin tildes ni mayúsculas", () => {
    assert.equal(namesMatch("María José", "maria"), true);
    assert.equal(namesMatch("Laura", "  LAURA  Gómez"), true);
    assert.equal(namesMatch("Sofía", "Sofia"), true);
  });

  test("otro nombre no coincide", () => {
    assert.equal(namesMatch("Laura", "Camila"), false);
    assert.equal(namesMatch("Laura", ""), false);
    assert.equal(namesMatch("", ""), false);
  });
});
