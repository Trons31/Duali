import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cycleContaining, cycleLabel, cyclesBetween, frequencyLabel } from "@/lib/instructor-cycle-time";

const off = { diaPagoAbreSiguiente: false };
const on = { diaPagoAbreSiguiente: true };

describe("calendario de ciclos de instructores (spec 023 D6)", () => {
  test("semanal con pago el domingo: de lunes a domingo, se paga el domingo", () => {
    // 2026-11-04 es miércoles.
    assert.deepEqual(cycleContaining("2026-11-04", { frecuencia: "SEMANAL", diaPago: 7, ...off }), {
      inicio: "2026-11-02",
      fin: "2026-11-08",
      venceEl: "2026-11-08"
    });
    // El propio domingo es el último día de su ciclo.
    assert.equal(cycleContaining("2026-11-08", { frecuencia: "SEMANAL", diaPago: 7, ...off }).fin, "2026-11-08");
  });

  test("con 'lo del día de pago entra al siguiente' el día de pago abre el ciclo nuevo", () => {
    const window = cycleContaining("2026-11-08", { frecuencia: "SEMANAL", diaPago: 7, ...on });
    assert.deepEqual(window, { inicio: "2026-11-08", fin: "2026-11-14", venceEl: "2026-11-15" });
  });

  test("mensual día 15: del 16 al 15; con el interruptor, del 15 al 14", () => {
    assert.deepEqual(cycleContaining("2026-11-20", { frecuencia: "MENSUAL", diaPago: 15, ...off }), {
      inicio: "2026-11-16",
      fin: "2026-12-15",
      venceEl: "2026-12-15"
    });
    assert.deepEqual(cycleContaining("2026-11-14", { frecuencia: "MENSUAL", diaPago: 15, ...on }), {
      inicio: "2026-10-15",
      fin: "2026-11-14",
      venceEl: "2026-11-15"
    });
  });

  test("quincenal día 15: el 15 y el 30 (15 días después), cruzando meses", () => {
    const settings = { frecuencia: "QUINCENAL" as const, diaPago: 15, ...off };
    assert.deepEqual(cycleContaining("2026-11-20", settings), { inicio: "2026-11-16", fin: "2026-11-30", venceEl: "2026-11-30" });
    assert.deepEqual(cycleContaining("2026-12-02", settings), { inicio: "2026-12-01", fin: "2026-12-15", venceEl: "2026-12-15" });
  });

  test("diario: cada día es su ciclo; con el interruptor se paga al día siguiente", () => {
    assert.deepEqual(cycleContaining("2026-11-04", { frecuencia: "DIARIO", diaPago: 1, ...off }), {
      inicio: "2026-11-04",
      fin: "2026-11-04",
      venceEl: "2026-11-04"
    });
    assert.equal(cycleContaining("2026-11-04", { frecuencia: "DIARIO", diaPago: 1, ...on }).venceEl, "2026-11-05");
  });

  test("el primer ciclo empieza el día de activación, sin deuda de antes", () => {
    const windows = cyclesBetween("2026-11-04", "2026-11-17", { frecuencia: "SEMANAL", diaPago: 7, ...off });
    assert.deepEqual(
      windows.map((item) => [item.inicio, item.fin]),
      [
        ["2026-11-04", "2026-11-08"],
        ["2026-11-09", "2026-11-15"],
        ["2026-11-16", "2026-11-22"]
      ]
    );
  });

  test("textos", () => {
    assert.equal(cycleLabel("2026-11-01", "2026-11-15"), "1 – 15 nov");
    assert.equal(cycleLabel("2026-10-28", "2026-11-03"), "28 oct – 3 nov");
    assert.equal(frequencyLabel("SEMANAL", 7), "Semanal, los domingos");
    assert.equal(frequencyLabel("SEMANAL", 1), "Semanal, los lunes");
    assert.equal(frequencyLabel("QUINCENAL", 15), "Quincenal, días 15 y 30");
  });
});
