// Permisos de los colaboradores (spec 024 D4 y D5), como
// lib/collaborator-permissions.ts de CliqCut. Lo usan la API (403), el menu y
// el formulario, asi que no importa nada del servidor.

export const COLLABORATOR_PERMISSION_KEYS = [
  "INICIO",
  "HORARIO",
  "AVISOS",
  "CLIENTES",
  "PAQUETES",
  "PAGINA",
  "VER_COLABORADORES",
  "VER_PAGOS",
  "HACER_PAGOS",
  "EGRESOS",
  "CONTABILIDAD",
  "VER_AJUSTES",
  "EDITAR_AJUSTES",
  "ACADEMIA"
] as const;

export type CollaboratorPermissionKey = (typeof COLLABORATOR_PERMISSION_KEYS)[number];
export type CollaboratorPermissions = Record<CollaboratorPermissionKey, boolean>;
export type CollaboratorRole = "ADMIN" | "SOCIO";

/**
 * Lo que se le puede pedir a una ruta: un permiso del formulario, EQUIPO (editar
 * instructores y el ciclo de pago: solo dueña y socio) o DUENA (solo la dueña:
 * su plan y los colaboradores).
 */
export type Requirement = CollaboratorPermissionKey | "EQUIPO" | "DUENA";

export const COLLABORATOR_PERMISSION_GROUPS: Array<{
  title: string;
  permissions: Array<{ key: CollaboratorPermissionKey; label: string; description: string }>;
}> = [
  {
    title: "Operación",
    permissions: [
      { key: "INICIO", label: "Inicio", description: "Siempre activo: el resumen del día." },
      { key: "HORARIO", label: "Horario y asistencia", description: "Ver y cambiar el horario, reservar cupos y marcar asistencia." },
      { key: "AVISOS", label: "Avisos", description: "Ver y enviar avisos a las clientas." },
      { key: "CLIENTES", label: "Clientes y ventas", description: "Ver clientes, vender planes, registrar sus pagos y revisar comprobantes." },
      { key: "PAQUETES", label: "Paquetes y precios", description: "Crear y editar disciplinas, paquetes y precios." },
      { key: "PAGINA", label: "Página pública y contenido", description: "Editar la página pública y las publicaciones." }
    ]
  },
  {
    title: "Equipo",
    permissions: [
      { key: "VER_COLABORADORES", label: "Ver instructores", description: "Ver los instructores y cómo se les paga (sin editarlos)." },
      { key: "VER_PAGOS", label: "Ver pagos a instructores", description: "Ver lo que se les debe y el historial." },
      { key: "HACER_PAGOS", label: "Realizar pagos", description: "Registrar y anular pagos a instructores (incluye ver pagos)." }
    ]
  },
  {
    title: "Finanzas",
    permissions: [
      { key: "EGRESOS", label: "Egresos", description: "Ver y registrar egresos." },
      { key: "CONTABILIDAD", label: "Contabilidad", description: "Ver balances y movimientos." }
    ]
  },
  {
    title: "Ajustes",
    permissions: [
      { key: "VER_AJUSTES", label: "Ver ajustes", description: "Consultar la configuración del negocio." },
      { key: "EDITAR_AJUSTES", label: "Editar ajustes", description: "Cambiar la configuración (incluye ver ajustes)." }
    ]
  },
  {
    title: "Academia",
    permissions: [{ key: "ACADEMIA", label: "Alumnos, grupos y cobros", description: "Todo lo del módulo Academia." }]
  }
];

export const EMPTY_PERMISSIONS = Object.fromEntries(COLLABORATOR_PERMISSION_KEYS.map((key) => [key, false])) as CollaboratorPermissions;

/** D4: Inicio siempre; Realizar pagos incluye Ver pagos; Editar ajustes incluye Ver ajustes. */
export function normalizePermissions(value: unknown): CollaboratorPermissions {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result = { ...EMPTY_PERMISSIONS };
  for (const key of COLLABORATOR_PERMISSION_KEYS) result[key] = source[key] === true;
  result.INICIO = true;
  if (result.HACER_PAGOS) result.VER_PAGOS = true;
  if (result.EDITAR_AJUSTES) result.VER_AJUSTES = true;
  return result;
}

export function countPermissions(permissions: CollaboratorPermissions) {
  return COLLABORATOR_PERMISSION_KEYS.filter((key) => permissions[key]).length;
}

export type Access =
  | { kind: "OWNER" }
  | { kind: "COLLABORATOR"; role: CollaboratorRole; permissions: CollaboratorPermissions };

/** D2: el socio tiene todos los permisos y edita el equipo; nunca lo de la dueña. */
export function allows(access: Access, requirement: Requirement | Requirement[]) {
  if (access.kind === "OWNER") return true;
  const list = Array.isArray(requirement) ? requirement : [requirement];
  return list.some((item) => {
    if (item === "DUENA") return false;
    if (access.role === "SOCIO") return true;
    if (item === "EQUIPO") return false;
    return access.permissions[item];
  });
}

type Rule = { path: RegExp; methods?: string[]; need: Requirement | Requirement[] };

const READ = ["GET"];
const WRITE = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * D5: cada ruta de la API del negocio y lo que pide. Gana la primera que
 * coincide. Lo que no esta aqui es solo de la dueña, asi que una ruta nueva que
 * se olvide no queda abierta. Las lecturas que usan varias pantallas (disciplinas,
 * paquetes, perfil) son de Inicio para que una pagina no se rompa por leer datos
 * de otra seccion.
 */
export const API_RULES: Rule[] = [
  { path: /^\/api\/auth\/me$/, need: "INICIO" },
  { path: /^\/api\/notifications(\/|$)/, need: "INICIO" },

  // Agenda
  { path: /^\/api\/(class-schedules|class-sessions|attendance|waitlist|bookings)(\/|$)/, need: "HORARIO" },
  { path: /^\/api\/studio-reminders(\/|$)/, need: "AVISOS" },

  // Ventas
  { path: /^\/api\/studio-members(\/|$)/, methods: READ, need: ["CLIENTES", "HORARIO", "AVISOS"] },
  { path: /^\/api\/payment-receipts$/, methods: READ, need: ["CLIENTES", "AVISOS"] },
  { path: /^\/api\/(studio-members|member-packages|payment-receipts)(\/|$)/, need: "CLIENTES" },
  { path: /^\/api\/(disciplines|packages)(\/|$)/, methods: READ, need: "INICIO" },
  { path: /^\/api\/(disciplines|packages)(\/|$)/, methods: WRITE, need: "PAQUETES" },

  // Mi pagina
  { path: /^\/api\/client\/public-page$/, methods: READ, need: "INICIO" },
  { path: /^\/api\/client\/public-page$/, methods: WRITE, need: "PAGINA" },
  { path: /^\/api\/content-posts(\/|$)/, need: "PAGINA" },
  { path: /^\/api\/media(\/|$)/, need: ["PAGINA", "EDITAR_AJUSTES"] },

  // Equipo (spec 023): el administrador solo ve a los instructores.
  { path: /^\/api\/instructors$/, methods: READ, need: ["VER_COLABORADORES", "HORARIO"] },
  { path: /^\/api\/instructors\/[^/]+$/, methods: READ, need: "VER_COLABORADORES" },
  { path: /^\/api\/instructors(\/|$)/, need: "EQUIPO" },
  { path: /^\/api\/instructor-payments\/settings$/, methods: READ, need: "VER_PAGOS" },
  { path: /^\/api\/instructor-payments\/settings$/, need: "EQUIPO" },
  { path: /^\/api\/instructor-payments\/pay$/, need: "HACER_PAGOS" },
  { path: /^\/api\/instructor-payments(\/|$)/, methods: READ, need: "VER_PAGOS" },
  { path: /^\/api\/instructor-payments\/[^/]+$/, methods: ["DELETE"], need: "HACER_PAGOS" },

  // Finanzas
  { path: /^\/api\/expenses(\/|$)/, need: "EGRESOS" },
  { path: /^\/api\/accounting(\/|$)/, need: "CONTABILIDAD" },

  // Ajustes (el plan y los colaboradores no estan: son de la dueña)
  { path: /^\/api\/client\/profile$/, methods: READ, need: "INICIO" },
  { path: /^\/api\/client\/profile$/, methods: WRITE, need: "EDITAR_AJUSTES" },

  // Academia
  {
    path: /^\/api\/(students|groups|monthly-payments|enrollment-payments|supplies-payments|reminders|payments)(\/|$)/,
    need: "ACADEMIA"
  }
];

export function requirementForApi(pathname: string, method: string): Requirement {
  const verb = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  const rule = API_RULES.find((item) => item.path.test(pathname) && (!item.methods || item.methods.includes(verb)));
  return (rule?.need as Requirement) ?? "DUENA";
}

/** R6: que pide cada pagina del panel (la mas especifica gana). */
export const PAGE_RULES: Array<{ prefix: string; need: Requirement | Requirement[] }> = [
  { prefix: "/dashboard/colaboradores/pagos", need: "VER_PAGOS" },
  { prefix: "/dashboard/instructores/pagos", need: "VER_PAGOS" },
  { prefix: "/dashboard/colaboradores", need: ["VER_COLABORADORES", "EQUIPO"] },
  { prefix: "/dashboard/instructores", need: ["VER_COLABORADORES", "EQUIPO"] },
  { prefix: "/dashboard/horario", need: "HORARIO" },
  { prefix: "/dashboard/avisos", need: "AVISOS" },
  { prefix: "/dashboard/clientes", need: "CLIENTES" },
  { prefix: "/dashboard/ventas", need: "CLIENTES" },
  { prefix: "/dashboard/paquetes", need: "PAQUETES" },
  { prefix: "/dashboard/mi-pagina", need: "PAGINA" },
  { prefix: "/dashboard/contenido", need: "PAGINA" },
  { prefix: "/dashboard/egresos", need: "EGRESOS" },
  { prefix: "/dashboard/contabilidad", need: "CONTABILIDAD" },
  { prefix: "/dashboard/ajustes", need: "VER_AJUSTES" },
  { prefix: "/dashboard/perfil", need: "VER_AJUSTES" },
  { prefix: "/dashboard/cliente", need: "VER_AJUSTES" },
  { prefix: "/dashboard/mi-plan", need: "DUENA" },
  { prefix: "/dashboard/notificaciones", need: "INICIO" },
  { prefix: "/dashboard/estudiantes", need: "ACADEMIA" },
  { prefix: "/dashboard/grupos", need: "ACADEMIA" },
  { prefix: "/dashboard/cobros", need: "ACADEMIA" },
  { prefix: "/dashboard/mensualidades", need: "ACADEMIA" },
  { prefix: "/dashboard/inscripciones", need: "ACADEMIA" },
  { prefix: "/dashboard/utiles", need: "ACADEMIA" },
  { prefix: "/dashboard", need: "INICIO" }
];

export function requirementForPage(pathname: string): Requirement | Requirement[] {
  const rule = PAGE_RULES.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  return rule?.need ?? "DUENA";
}

export function canSeePage(access: Access, pathname: string) {
  return allows(access, requirementForPage(pathname));
}
