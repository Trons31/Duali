import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { studioMonthRange } from "@/lib/studio-dashboard";

describe("mes en hora de Bogotá (spec 013)", () => {
  test("octubre empieza a las 5:00 UTC del 1 y termina al empezar noviembre", () => {
    const range = studioMonthRange("2026-10-09");
    assert.equal(range.from.toISOString(), "2026-10-01T05:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-11-01T05:00:00.000Z");
  });

  test("diciembre pasa al año siguiente", () => {
    const range = studioMonthRange("2026-12-31");
    assert.equal(range.to.toISOString(), "2027-01-01T05:00:00.000Z");
  });

  test("un pago del 31 a las 11 p. m. de Bogotá cuenta en ese mes", () => {
    const range = studioMonthRange("2026-10-31");
    const payment = new Date("2026-11-01T04:00:00Z"); // 31 oct 23:00 en Bogotá
    assert.ok(payment >= range.from && payment < range.to);
  });
});
