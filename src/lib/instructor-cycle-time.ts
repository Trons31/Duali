// Calendario de los ciclos de pago de instructores (spec 023 D6), como
// lib/payment-cycle.ts de CliqCut pero con fechas "de pared" (YYYY-MM-DD).
import { addDaysToKey, daysBetweenKeys, isoWeekday } from "@/lib/studio-time";

export const PAY_FREQUENCIES = ["DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export type CycleWindow = {
  /** Primer dia del ciclo, inclusive. */
  inicio: string;
  /** Ultimo dia del ciclo, inclusive. */
  fin: string;
  /** Dia en que se paga. */
  venceEl: string;
};

/** Semanal: dia ISO 1 (lunes) a 7 (domingo). Quincenal y mensual: 1 a 28. Diario: no aplica. */
export function safePayDay(frecuencia: PayFrequency, diaPago: number) {
  if (frecuencia === "DIARIO") return 1;
  if (frecuencia === "SEMANAL") return Number.isInteger(diaPago) && diaPago >= 1 && diaPago <= 7 ? diaPago : 7;
  return Number.isInteger(diaPago) ? Math.min(28, Math.max(1, diaPago)) : 1;
}

function withDay(key: string, monthOffset: number, day: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + monthOffset, day));
  return date.toISOString().slice(0, 10);
}

/** Fechas de pago cercanas a `key` (unos dos meses a cada lado), ordenadas. */
function payDatesAround(frecuencia: PayFrequency, diaPago: number, key: string) {
  const day = safePayDay(frecuencia, diaPago);
  if (frecuencia === "DIARIO") return Array.from({ length: 5 }, (_, index) => addDaysToKey(key, index - 2));
  if (frecuencia === "SEMANAL") {
    const back = (isoWeekday(key) - day + 7) % 7;
    const anchor = addDaysToKey(key, -back);
    return Array.from({ length: 5 }, (_, index) => addDaysToKey(anchor, (index - 2) * 7));
  }
  const dates: string[] = [];
  for (let offset = -2; offset <= 2; offset += 1) {
    const anchor = withDay(key, offset, day);
    dates.push(anchor);
    // Quincenal como CliqCut: el dia elegido y 15 dias despues.
    if (frecuencia === "QUINCENAL") dates.push(addDaysToKey(anchor, 15));
  }
  return [...new Set(dates)].sort();
}

/**
 * El ciclo que contiene `key`.
 *
 * - Apagado "lo del dia de pago entra al siguiente": el dia de pago es el ULTIMO
 *   dia del ciclo que se paga ese dia (pagas el 15 lo dictado hasta el 15).
 * - Encendido: el dia de pago ABRE el ciclo siguiente (pagas el 15 lo dictado
 *   hasta el 14).
 */
export function cycleContaining(
  key: string,
  settings: { frecuencia: PayFrequency; diaPago: number; diaPagoAbreSiguiente: boolean }
): CycleWindow {
  const dates = payDatesAround(settings.frecuencia, settings.diaPago, key);
  if (settings.diaPagoAbreSiguiente) {
    const index = dates.findIndex((date) => date > key);
    const venceEl = dates[index];
    return { inicio: dates[index - 1], fin: addDaysToKey(venceEl, -1), venceEl };
  }
  const index = dates.findIndex((date) => date >= key);
  const venceEl = dates[index];
  return { inicio: addDaysToKey(dates[index - 1], 1), fin: venceEl, venceEl };
}

/**
 * Los ciclos desde `desde` hasta el que contiene `hasta`. El primero empieza en
 * `desde` aunque el calendario lo haya empezado antes: no se genera deuda de
 * antes de activar (D6).
 */
export function cyclesBetween(
  desde: string,
  hasta: string,
  settings: { frecuencia: PayFrequency; diaPago: number; diaPagoAbreSiguiente: boolean }
): CycleWindow[] {
  const windows: CycleWindow[] = [];
  let cursor = desde;
  // Tope de seguridad: dos años de ciclos diarios.
  while (cursor <= hasta && windows.length < 800) {
    const window = cycleContaining(cursor, settings);
    windows.push({ ...window, inicio: cursor });
    cursor = addDaysToKey(window.fin, 1);
  }
  return windows;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function short(key: string) {
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/** "1 – 15 nov", "28 oct – 3 nov" o "5 nov". */
export function cycleLabel(inicio: string, fin: string) {
  if (inicio === fin) return short(inicio);
  if (inicio.slice(0, 7) === fin.slice(0, 7)) return `${Number(inicio.slice(8))} – ${short(fin)}`;
  return `${short(inicio)} – ${short(fin)}`;
}

const WEEKDAY_NAMES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** "Semanal, los domingos", "Quincenal, días 15 y 30", "Mensual, día 15", "Diario". */
export function frequencyLabel(frecuencia: PayFrequency, diaPago: number) {
  const day = safePayDay(frecuencia, diaPago);
  if (frecuencia === "DIARIO") return "Diario";
  if (frecuencia === "SEMANAL") return `Semanal, los ${WEEKDAY_NAMES[day]}${day >= 6 ? "s" : ""}`;
  if (frecuencia === "QUINCENAL") return `Quincenal, días ${day} y ${day + 15}`;
  return `Mensual, día ${day}`;
}

const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Las proximas fechas de pago desde hoy (incluido), como "próximos pagos" de CliqCut. */
export function upcomingPayDates(frecuencia: PayFrequency, diaPago: number, today: string, count = 2) {
  const dates: string[] = [];
  let cursor = today;
  while (dates.length < count) {
    const { venceEl } = cycleContaining(cursor, { frecuencia, diaPago, diaPagoAbreSiguiente: false });
    dates.push(venceEl);
    cursor = addDaysToKey(venceEl, 1);
  }
  return dates;
}

/** "15 de octubre". */
export function longDate(key: string) {
  const [, month, day] = key.split("-").map(Number);
  return `${day} de ${MONTHS_LONG[month - 1]}`;
}

/** Dias que faltan para pagar (0 = hoy, negativo = vencido). */
export function daysUntil(today: string, venceEl: string) {
  return daysBetweenKeys(today, venceEl);
}
