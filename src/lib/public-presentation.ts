// Calculos de presentacion de la pagina publica (spec 012). Funciones puras.

type Plan = { id: string; clases: number; precio: number };

export function pricePerClass(plan: Pick<Plan, "clases" | "precio">) {
  return plan.clases > 0 ? plan.precio / plan.clases : plan.precio;
}

/** El plan de menor precio por clase; null si hay menos de dos para comparar. */
export function bestValuePlanId(plans: Plan[]) {
  if (plans.length < 2) return null;
  const sorted = [...plans].sort((a, b) => pricePerClass(a) - pricePerClass(b) || b.clases - a.clases);
  // Si todos cuestan lo mismo por clase, ninguno es "mejor valor".
  return pricePerClass(sorted[0]) < pricePerClass(sorted[sorted.length - 1]) ? sorted[0].id : null;
}

export function lowestPrice(plans: Array<Pick<Plan, "precio">>) {
  return plans.length ? Math.min(...plans.map((plan) => plan.precio)) : null;
}

/** "Body Combat, Rumba Fit y Jump Power" */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function reserveHref(slug: string, session?: { scheduleId: string; fecha: string } | null, planId?: string | null) {
  const params = new URLSearchParams();
  if (session) {
    params.set("h", session.scheduleId);
    params.set("f", session.fecha);
  }
  if (planId) params.set("plan", planId);
  const query = params.toString();
  return `/s/${slug}/reservar${query ? `?${query}` : ""}`;
}

export function formatCop(value: number) {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}
