import type { IconType } from "react-icons";
import {
  FiHome,
  FiMoreHorizontal,
  FiPackage,
  FiShoppingBag,
  FiTag,
  FiTool,
  FiTrendingDown,
  FiUsers,
  FiZap
} from "react-icons/fi";

/**
 * Catalogo de tipos de egreso.
 *
 * El `id` es lo que se guarda en `Expense.categoria`, que es texto libre en la
 * base. Por eso los egresos viejos (con cualquier texto, o sin nada) siguen
 * funcionando: se muestran con `expenseCategoryLabel`, que devuelve el texto
 * tal cual cuando no reconoce el id.
 */

export const EXPENSE_CATEGORIES: readonly {
  id: string;
  label: string;
  icon: IconType;
  tone: string;
}[] = [
  { id: "SUPPLIES", label: "Insumos", icon: FiPackage, tone: "bg-blue-50 text-blue-700" },
  { id: "RENT", label: "Arriendo", icon: FiHome, tone: "bg-orange-50 text-orange-700" },
  { id: "UTILITIES", label: "Servicios públ.", icon: FiZap, tone: "bg-amber-50 text-amber-700" },
  { id: "SALARY", label: "Nómina", icon: FiUsers, tone: "bg-violet-50 text-violet-700" },
  { id: "FOOD", label: "Alimentación", icon: FiShoppingBag, tone: "bg-emerald-50 text-emerald-700" },
  { id: "MARKETING", label: "Marketing", icon: FiTag, tone: "bg-pink-50 text-pink-700" },
  { id: "MAINTENANCE", label: "Mantenimiento", icon: FiTool, tone: "bg-slate-50 text-slate-700" },
  { id: "COMMISSION", label: "Comisión", icon: FiTrendingDown, tone: "bg-rose-50 text-rose-700" },
  { id: "OTHER", label: "Otro", icon: FiMoreHorizontal, tone: "bg-ink-50 text-ink-600" }
];

export function findExpenseCategory(id: string | null | undefined) {
  if (!id) return null;
  return EXPENSE_CATEGORIES.find((category) => category.id === id) ?? null;
}

/**
 * Como `categoria` admite texto libre, un egreso guardado antes de este
 * catalogo trae algo que no esta en la lista. En ese caso se muestra su propio
 * texto en vez de esconderlo tras un "Otro" que no dice nada.
 */
export function expenseCategoryLabel(id: string | null | undefined) {
  if (!id) return "General";
  return findExpenseCategory(id)?.label ?? id;
}
