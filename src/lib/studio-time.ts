// Fechas "de pared" del estudio (spec 005). Una fecha es la cadena YYYY-MM-DD y
// se guarda como DATE; una hora es "HH:mm". Nada depende de la zona horaria del
// servidor (Vercel corre en UTC): "hoy" y "ahora" se calculan en Bogota.

export const STUDIO_TIME_ZONE = "America/Bogota";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^([01]\d|2[0-3]):[0-5]\d$/;

export const WEEKDAYS = [
  { value: 1, short: "Lun", label: "Lunes" },
  { value: 2, short: "Mar", label: "Martes" },
  { value: 3, short: "Mié", label: "Miércoles" },
  { value: 4, short: "Jue", label: "Jueves" },
  { value: 5, short: "Vie", label: "Viernes" },
  { value: 6, short: "Sáb", label: "Sábado" },
  { value: 7, short: "Dom", label: "Domingo" }
] as const;

export function isDateKey(value: string) {
  // Ida y vuelta: Date acepta "2026-02-30" y lo pasa al 2 de marzo.
  return DATE_KEY.test(value) && !Number.isNaN(dateKeyToDate(value).getTime()) && dateToDateKey(dateKeyToDate(value)) === value;
}

export function isTimeKey(value: string) {
  return TIME_KEY.test(value);
}

/** YYYY-MM-DD → Date a medianoche UTC, que es como Prisma lee y escribe DATE. */
export function dateKeyToDate(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

export function dateToDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDaysToKey(key: string, days: number) {
  const date = dateKeyToDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToDateKey(date);
}

/** 1 = lunes ... 7 = domingo. */
export function isoWeekday(key: string) {
  const day = dateKeyToDate(key).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfWeekKey(key: string) {
  return addDaysToKey(key, 1 - isoWeekday(key));
}

export function eachDateKey(from: string, to: string) {
  const keys: string[] = [];
  for (let key = from; key <= to; key = addDaysToKey(key, 1)) keys.push(key);
  return keys;
}

export function daysBetweenKeys(from: string, to: string) {
  return Math.round((dateKeyToDate(to).getTime() - dateKeyToDate(from).getTime()) / 86_400_000);
}

/** Fecha y minutos del dia en Bogota para un instante dado. */
export function studioNow(instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute"))
  };
}

export function studioTodayKey(instant = new Date()) {
  return studioNow(instant).dateKey;
}

export function timeKeyToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "18:30" → "6:30 p. m." */
export function formatTimeKey(time: string) {
  const total = timeKeyToMinutes(time);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hours < 12 ? "a. m." : "p. m.";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function addMinutesToTimeKey(time: string, minutes: number) {
  const total = (timeKeyToMinutes(time) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Spec 007 R2: ¿faltan al menos `horas` para que empiece la clase (hora de Bogota)? */
export function isBeforeCancellationDeadline(fecha: string, horaInicio: string, horas: number, instant = new Date()) {
  const now = studioNow(instant);
  const minutesUntilStart = daysBetweenKeys(now.dateKey, fecha) * 24 * 60 + timeKeyToMinutes(horaInicio) - now.minutes;
  return minutesUntilStart >= horas * 60;
}
