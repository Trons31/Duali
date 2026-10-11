import { addDaysToKey, dateKeyToDate, isDateKey, isoWeekday, startOfWeekKey } from "@/lib/studio-time";

// Spec 028: los periodos de Contabilidad (como los filtros de CliqCut). Funciones
// puras: fechas "de pared" del estudio (YYYY-MM-DD, hora de Bogotá).

export const ACCOUNTING_FILTERS = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mes" },
  { id: "lastmonth", label: "Mes pasado" },
  { id: "specificmonth", label: "Elegir mes" },
  { id: "custom", label: "Personalizado" },
  { id: "day", label: "Ver por día" },
  { id: "paymentcycle", label: "Ciclo de pago" }
] as const;

export type AccountingFilter = (typeof ACCOUNTING_FILTERS)[number]["id"];

export type AccountingPeriod = {
  filter: AccountingFilter;
  from: string;
  to: string;
  label: string;
  /** "YYYY-MM" del mes elegido (Elegir mes y Ver por día). */
  month: string;
  /** "inicio_fin" del ciclo elegido. */
  cycle: string | null;
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const isMonthKey = (value: string | null | undefined): value is string => Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

function monthRange(month: string) {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function previousMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
}

function shortDay(key: string) {
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${SHORT[month - 1]}`;
}

function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number);
  return `${MONTHS[number - 1][0].toUpperCase()}${MONTHS[number - 1].slice(1)} ${year}`;
}

/** "5 – 11 oct" o "28 sep – 4 oct". */
export function rangeLabel(from: string, to: string) {
  if (from === to) return shortDay(from);
  const fromDay = Number(from.slice(8));
  return from.slice(0, 7) === to.slice(0, 7) ? `${fromDay} – ${shortDay(to)}` : `${shortDay(from)} – ${shortDay(to)}`;
}

function dayLabel(key: string) {
  const [, month, day] = key.split("-").map(Number);
  return `${WEEKDAYS[isoWeekday(key) - 1]} ${day} de ${MONTHS[month - 1]}`;
}

/** Un ciclo viaja en la URL como "inicio_fin". */
export function parseCycle(value: string | null | undefined) {
  const [from, to] = (value ?? "").split("_");
  return from && to && isDateKey(from) && isDateKey(to) && from <= to ? { from, to } : null;
}

/**
 * Lee los parámetros de la URL y devuelve el rango. Lo inválido cae en "Este
 * mes"; un rango al revés se voltea. `defaultCycle` es el ciclo más reciente,
 * para cuando se elige "Ciclo de pago" sin uno.
 */
export function resolveAccountingPeriod(
  params: { filter?: string | null; from?: string | null; to?: string | null; month?: string | null; day?: string | null; cycle?: string | null },
  today: string,
  defaultCycle: string | null = null
): AccountingPeriod {
  const thisMonth = today.slice(0, 7);
  const base = { month: thisMonth, cycle: null as string | null };
  const filter = ACCOUNTING_FILTERS.some((item) => item.id === params.filter) ? (params.filter as AccountingFilter) : "month";

  switch (filter) {
    case "today":
      return { ...base, filter, from: today, to: today, label: `Hoy · ${dayLabel(today)}` };
    case "week": {
      const from = startOfWeekKey(today);
      return { ...base, filter, from, to: addDaysToKey(from, 6), label: `Semana del ${rangeLabel(from, addDaysToKey(from, 6))}` };
    }
    case "lastmonth": {
      const month = previousMonth(thisMonth);
      return { ...base, filter, ...monthRange(month), month, label: monthLabel(month) };
    }
    case "specificmonth": {
      const month = isMonthKey(params.month) ? params.month : thisMonth;
      return { ...base, filter, ...monthRange(month), month, label: monthLabel(month) };
    }
    case "custom": {
      let from = params.from && isDateKey(params.from) ? params.from : `${thisMonth}-01`;
      let to = params.to && isDateKey(params.to) ? params.to : today;
      if (from > to) [from, to] = [to, from];
      return { ...base, filter, from, to, label: rangeLabel(from, to) };
    }
    case "day": {
      const day = params.day && isDateKey(params.day) ? params.day : today;
      return { ...base, filter, from: day, to: day, month: day.slice(0, 7), label: dayLabel(day) };
    }
    case "paymentcycle": {
      const cycle = parseCycle(params.cycle) ?? parseCycle(defaultCycle);
      if (!cycle) return { ...base, filter, ...monthRange(thisMonth), label: monthLabel(thisMonth) };
      return { ...base, filter, ...cycle, cycle: `${cycle.from}_${cycle.to}`, label: `Ciclo ${rangeLabel(cycle.from, cycle.to)}` };
    }
    default:
      return { ...base, filter: "month", ...monthRange(thisMonth), label: monthLabel(thisMonth) };
  }
}

/**
 * Los instantes que cubren el rango en hora de Bogotá (UTC−5, sin horario de
 * verano): del día `from` a las 00:00 hasta antes del día siguiente a `to`.
 */
export function periodInstants(from: string, to: string) {
  return { gte: new Date(`${from}T05:00:00.000Z`), lt: new Date(`${addDaysToKey(to, 1)}T05:00:00.000Z`) };
}

/** Para las columnas DATE (sin hora). */
export function periodDates(from: string, to: string) {
  return { gte: dateKeyToDate(from), lte: dateKeyToDate(to) };
}
