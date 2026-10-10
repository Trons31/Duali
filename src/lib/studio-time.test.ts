import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addDaysToKey,
  addMinutesToTimeKey,
  daysBetweenKeys,
  eachDateKey,
  formatTimeKey,
  isBeforeCancellationDeadline,
  isDateKey,
  isTimeKey,
  isoWeekday,
  startOfWeekKey,
  studioNow
} from "@/lib/studio-time";

describe("fechas de pared (spec 005)", () => {
  test("isDateKey rechaza fechas que no existen", () => {
    assert.equal(isDateKey("2026-02-28"), true);
    assert.equal(isDateKey("2028-02-29"), true);
    assert.equal(isDateKey("2026-02-29"), false);
    assert.equal(isDateKey("2026-02-30"), false);
    assert.equal(isDateKey("2026-13-01"), false);
    assert.equal(isDateKey("26-1-1"), false);
  });

  test("isTimeKey solo acepta HH:mm de 00:00 a 23:59", () => {
    assert.equal(isTimeKey("06:00"), true);
    assert.equal(isTimeKey("23:59"), true);
    assert.equal(isTimeKey("24:00"), false);
    assert.equal(isTimeKey("6:00"), false);
    assert.equal(isTimeKey("18:60"), false);
  });

  test("isoWeekday: 1 = lunes, 7 = domingo", () => {
    assert.equal(isoWeekday("2026-10-12"), 1);
    assert.equal(isoWeekday("2026-10-17"), 6);
    assert.equal(isoWeekday("2026-10-18"), 7);
  });

  test("la semana empieza el lunes, también desde un domingo", () => {
    assert.equal(startOfWeekKey("2026-10-18"), "2026-10-12");
    assert.equal(startOfWeekKey("2026-10-12"), "2026-10-12");
    assert.equal(startOfWeekKey("2027-01-01"), "2026-12-28");
  });

  test("sumar días cruza meses y años", () => {
    assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
    assert.equal(addDaysToKey("2026-03-01", -1), "2026-02-28");
    assert.equal(addDaysToKey("2026-10-01", 29), "2026-10-30");
  });

  test("rangos y diferencias de días", () => {
    assert.deepEqual(eachDateKey("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    assert.equal(daysBetweenKeys("2026-10-09", "2026-10-12"), 3);
    assert.equal(daysBetweenKeys("2026-10-12", "2026-10-09"), -3);
  });

  test("studioNow usa la hora de Bogotá, no la del servidor (UTC)", () => {
    // 03:30 UTC del 10 de octubre = 22:30 del 9 en Bogotá.
    assert.deepEqual(studioNow(new Date("2026-10-10T03:30:00Z")), { dateKey: "2026-10-09", minutes: 22 * 60 + 30 });
    assert.deepEqual(studioNow(new Date("2026-10-10T05:00:00Z")), { dateKey: "2026-10-10", minutes: 0 });
  });

  test("formato de hora en 12 h", () => {
    assert.equal(formatTimeKey("18:05"), "6:05 p. m.");
    assert.equal(formatTimeKey("00:00"), "12:00 a. m.");
    assert.equal(formatTimeKey("12:00"), "12:00 p. m.");
    assert.equal(formatTimeKey("06:30"), "6:30 a. m.");
  });

  test("sumar minutos a una hora", () => {
    assert.equal(addMinutesToTimeKey("18:00", 60), "19:00");
    assert.equal(addMinutesToTimeKey("23:30", 45), "00:15");
  });
});

describe("plazo para cancelar y recuperar la clase (spec 007 R2)", () => {
  // Clase el lunes 12 de octubre a las 18:00 de Bogotá (23:00 UTC), plazo de 2 h.
  test("con más de 2 h de anticipación se devuelve", () => {
    assert.equal(isBeforeCancellationDeadline("2026-10-12", "18:00", 2, new Date("2026-10-12T20:59:00Z")), true);
  });

  test("justo 2 h antes todavía se devuelve", () => {
    assert.equal(isBeforeCancellationDeadline("2026-10-12", "18:00", 2, new Date("2026-10-12T21:00:00Z")), true);
  });

  test("con menos de 2 h ya no se devuelve", () => {
    assert.equal(isBeforeCancellationDeadline("2026-10-12", "18:00", 2, new Date("2026-10-12T21:30:00Z")), false);
  });

  test("funciona cruzando la medianoche", () => {
    // Clase a las 06:00; 23:00 del día anterior en Bogotá = 7 h antes.
    assert.equal(isBeforeCancellationDeadline("2026-10-12", "06:00", 8, new Date("2026-10-12T04:00:00Z")), false);
    assert.equal(isBeforeCancellationDeadline("2026-10-12", "06:00", 8, new Date("2026-10-12T02:00:00Z")), true);
  });

  test("con plazo 0 se devuelve hasta que empieza", () => {
    assert.equal(isBeforeCancellationDeadline("2026-10-12", "18:00", 0, new Date("2026-10-12T22:59:00Z")), true);
    assert.equal(isBeforeCancellationDeadline("2026-10-12", "18:00", 0, new Date("2026-10-12T23:01:00Z")), false);
  });
});
