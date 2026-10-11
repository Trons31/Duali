import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { periodInstants, rangeLabel, resolveAccountingPeriod } from "@/lib/accounting-period";

// Domingo 11 de octubre de 2026.
const TODAY = "2026-10-11";

describe("periodos de Contabilidad (spec 028 R2)", () => {
  test("por defecto, y con cualquier cosa rara, es este mes", () => {
    for (const filter of [undefined, "", "otro"]) {
      const period = resolveAccountingPeriod({ filter }, TODAY);
      assert.deepEqual([period.filter, period.from, period.to, period.label], ["month", "2026-10-01", "2026-10-31", "Octubre 2026"]);
    }
  });

  test("hoy, esta semana (lunes a domingo) y mes pasado", () => {
    assert.deepEqual(pick(resolveAccountingPeriod({ filter: "today" }, TODAY)), ["2026-10-11", "2026-10-11"]);
    assert.deepEqual(pick(resolveAccountingPeriod({ filter: "week" }, TODAY)), ["2026-10-05", "2026-10-11"]);
    assert.deepEqual(pick(resolveAccountingPeriod({ filter: "lastmonth" }, "2026-01-15")), ["2025-12-01", "2025-12-31"]);
  });

  test("elegir mes respeta febrero y bisiestos", () => {
    assert.deepEqual(pick(resolveAccountingPeriod({ filter: "specificmonth", month: "2028-02" }, TODAY)), ["2028-02-01", "2028-02-29"]);
    assert.deepEqual(pick(resolveAccountingPeriod({ filter: "specificmonth", month: "2026-13" }, TODAY)), ["2026-10-01", "2026-10-31"]);
  });

  test("personalizado voltea un rango al revés; ver por día usa su mes", () => {
    assert.deepEqual(pick(resolveAccountingPeriod({ filter: "custom", from: "2026-10-20", to: "2026-10-02" }, TODAY)), ["2026-10-02", "2026-10-20"]);
    const day = resolveAccountingPeriod({ filter: "day", day: "2026-09-30" }, TODAY);
    assert.deepEqual([...pick(day), day.month, day.label], ["2026-09-30", "2026-09-30", "2026-09", "miércoles 30 de septiembre"]);
  });

  test("ciclo de pago: el pedido, o el más reciente si no hay", () => {
    const chosen = resolveAccountingPeriod({ filter: "paymentcycle", cycle: "2026-09-28_2026-10-04" }, TODAY, "2026-10-05_2026-10-11");
    assert.deepEqual([...pick(chosen), chosen.label], ["2026-09-28", "2026-10-04", "Ciclo 28 sep – 4 oct"]);
    assert.deepEqual(pick(resolveAccountingPeriod({ filter: "paymentcycle" }, TODAY, "2026-10-05_2026-10-11")), ["2026-10-05", "2026-10-11"]);
  });

  test("los instantes cubren el día completo en Bogotá", () => {
    const { gte, lt } = periodInstants("2026-10-11", "2026-10-11");
    assert.equal(gte.toISOString(), "2026-10-11T05:00:00.000Z");
    assert.equal(lt.toISOString(), "2026-10-12T05:00:00.000Z");
    assert.equal(rangeLabel("2026-10-05", "2026-10-11"), "5 – 11 oct");
  });
});

function pick(period: { from: string; to: string }) {
  return [period.from, period.to];
}
