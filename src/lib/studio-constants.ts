// Paleta fija de disciplinas (spec 003 R5): pocos colores para que el menu y la
// pagina publica se vean parejos.
export const DISCIPLINE_COLORS = [
  "#14b87e",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308"
] as const;

/** Celular de clientes del estudio: solo digitos y sin el 57 de Colombia. */
export function normalizeMemberPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
}

// ─── Pagina publica (specs 008 y 009) ─────────────────────────────────────────

export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "dashboard",
  "duali",
  "login",
  "registro",
  "reserva",
  "reservar",
  "s",
  "soporte",
  "www"
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

function withoutAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "Studio Dance Col!" → "studio-dance-col" */
export function suggestSlug(name: string) {
  const slug = withoutAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug.length >= 3 ? slug : `${slug || "estudio"}-duali`.slice(0, 40);
}

export function slugProblem(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug) || slug.includes("--")) {
    return "Usa de 3 a 40 letras minúsculas, números o guiones (sin guion al inicio o al final)";
  }
  if (RESERVED_SLUGS.has(slug)) return "Esa dirección está reservada";
  return null;
}

/**
 * Spec 009: sin contrasena, el nombre es la prueba minima de que quien reserva
 * con un celular registrado es esa persona. Basta con el primer nombre, sin
 * tildes ni mayusculas.
 */
export function namesMatch(registered: string, typed: string) {
  const first = (value: string) => withoutAccents(value).toLowerCase().trim().split(/\s+/)[0] ?? "";
  return first(registered) !== "" && first(registered) === first(typed);
}
