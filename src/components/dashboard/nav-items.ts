import type { IconType } from "react-icons";
import {
  FiCreditCard,
  FiBell,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiDollarSign,
  FiGlobe,
  FiGrid,
  FiImage,
  FiLayers,
  FiMessageCircle,
  FiPackage,
  FiShoppingBag,
  FiTrendingUp,
  FiUserCheck,
  FiUsers,
  FiZap
} from "react-icons/fi";
import { IoSettingsOutline } from "react-icons/io5";
import { canSeePage, type Access } from "@/lib/collaborator-permissions";
import type { BusinessModules } from "@/lib/web-types";

type NavItem = { href: string; label: string; icon: IconType };
type NavSection = {
  title: string;
  // Spec 002 R4: la seccion solo se muestra si su modulo esta activo.
  module?: "academia" | "estudio";
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "PRINCIPAL",
    items: [
      { href: "/dashboard", label: "Inicio", icon: FiGrid },
      { href: "/dashboard/notificaciones", label: "Notificaciones", icon: FiBell }
    ]
  },
  {
    title: "AGENDA",
    module: "estudio",
    items: [
      { href: "/dashboard/horario", label: "Horario de clases", icon: FiCalendar },
      { href: "/dashboard/avisos", label: "Avisos", icon: FiMessageCircle }
    ]
  },
  {
    title: "ACADEMIA",
    module: "academia",
    items: [
      { href: "/dashboard/estudiantes", label: "Alumnos", icon: FiUsers },
      { href: "/dashboard/grupos", label: "Grupos", icon: FiLayers }
    ]
  },
  {
    title: "VENTAS",
    module: "estudio",
    items: [
      { href: "/dashboard/clientes", label: "Clientes", icon: FiUsers },
      // Spec 027 D5: los cobros del estudio en su propia pagina.
      { href: "/dashboard/ventas/cobros", label: "Cobros", icon: FiDollarSign },
      { href: "/dashboard/paquetes", label: "Paquetes y precios", icon: FiPackage }
    ]
  },
  {
    // Spec 023 D9: el equipo del estudio.
    title: "EQUIPO",
    module: "estudio",
    // Spec 024 D1: como CliqCut, Colaboradores y Pagos.
    items: [
      { href: "/dashboard/colaboradores", label: "Colaboradores", icon: FiUserCheck },
      { href: "/dashboard/colaboradores/pagos", label: "Pagos", icon: FiCreditCard }
    ]
  },
  {
    title: "MI PÁGINA",
    module: "estudio",
    items: [
      { href: "/dashboard/mi-pagina", label: "Página pública", icon: FiGlobe },
      { href: "/dashboard/contenido", label: "Contenido", icon: FiImage }
    ]
  },
  {
    title: "COBROS",
    module: "academia",
    items: [
      { href: "/dashboard/cobros/pagos", label: "Pagos", icon: FiCheckCircle },
      { href: "/dashboard/cobros/pendientes", label: "Pendientes", icon: FiBookOpen },
      { href: "/dashboard/cobros/vencidos", label: "Vencidos", icon: FiTrendingUp },
      { href: "/dashboard/inscripciones", label: "Inscripciones", icon: FiBookOpen }
    ]
  },
  {
    title: "FINANZAS",
    items: [
      { href: "/dashboard/egresos", label: "Egresos", icon: FiDollarSign },
      { href: "/dashboard/contabilidad", label: "Contabilidad", icon: FiTrendingUp }
    ]
  },
  {
    title: "CUENTA",
    items: [
      { href: "/dashboard/ajustes", label: "Ajustes", icon: IoSettingsOutline },
      { href: "/dashboard/mi-plan", label: "Mi Plan", icon: FiZap }
    ]
  }
];

export function getNavSections(modules: BusinessModules, access: Access = { kind: "OWNER" }) {
  return navSections
    .filter((section) => {
      if (section.module === "academia") return modules.moduloAcademia;
      if (section.module === "estudio") return modules.moduloEstudio;
      return true;
    })
    // Spec 024 R6: un colaborador solo ve lo que tiene permitido.
    .map((section) => ({ ...section, items: section.items.filter((item) => canSeePage(access, item.href)) }))
    .filter((section) => section.items.length);
}
