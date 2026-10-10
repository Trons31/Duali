import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bestValuePlanId, formatCop, joinNames, lowestPrice, pricePerClass, reserveHref } from "@/lib/public-presentation";

const menu = [
  { id: "individual", clases: 1, precio: 15000 },
  { id: "basico", clases: 4, precio: 55000 },
  { id: "plus", clases: 8, precio: 110000 },
  { id: "premium", clases: 12, precio: 160000 },
  { id: "full", clases: 20, precio: 270000 }
];

describe("presentación de la página pública (spec 012)", () => {
  test("precio por clase", () => {
    assert.equal(pricePerClass({ clases: 4, precio: 55000 }), 13750);
    assert.equal(pricePerClass({ clases: 1, precio: 15000 }), 15000);
  });

  test("mejor valor = menor precio por clase (Premium en el menú real)", () => {
    // Premium 160.000 / 12 = 13.333 por clase; Full 270.000 / 20 = 13.500.
    assert.equal(bestValuePlanId(menu), "premium");
  });

  test("sin con qué comparar, o todos iguales por clase, no hay mejor valor", () => {
    assert.equal(bestValuePlanId([menu[0]]), null);
    assert.equal(bestValuePlanId([{ id: "a", clases: 1, precio: 10 }, { id: "b", clases: 2, precio: 20 }]), null);
  });

  test("desde $X", () => {
    assert.equal(lowestPrice(menu), 15000);
    assert.equal(lowestPrice([]), null);
  });

  test("frase con las disciplinas", () => {
    assert.equal(joinNames(["Body Combat", "Rumba Fit", "Jump Power"]), "Body Combat, Rumba Fit y Jump Power");
    assert.equal(joinNames(["Yoga"]), "Yoga");
    assert.equal(joinNames([]), "");
  });

  test("enlace para reservar una clase o con un plan", () => {
    assert.equal(reserveHref("studio", { scheduleId: "h1", fecha: "2026-10-12" }), "/s/studio/reservar?h=h1&f=2026-10-12");
    assert.equal(reserveHref("studio", null, "plan1"), "/s/studio/reservar?plan=plan1");
    assert.equal(reserveHref("studio"), "/s/studio/reservar");
  });

  test("pesos colombianos", () => {
    assert.equal(formatCop(13750), "$13.750");
  });
});
