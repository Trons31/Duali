import {
  FiBell,
  FiBookOpen,
  FiCreditCard,
  FiDollarSign,
  FiGrid,
  FiLayers,
  FiSettings,
  FiTrendingUp,
  FiUsers
} from "react-icons/fi";

export const navSections = [
  {
    title: "General",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: FiGrid },
      { href: "/dashboard/notificaciones", label: "Notificaciones", icon: FiBell }
    ]
  },
  {
    title: "Academia",
    items: [
      { href: "/dashboard/estudiantes", label: "Estudiantes", icon: FiUsers },
      { href: "/dashboard/grupos", label: "Grupos", icon: FiLayers }
    ]
  },
  {
    title: "Cobros",
    items: [
      { href: "/dashboard/mensualidades", label: "Mensualidades", icon: FiCreditCard },
      { href: "/dashboard/cobros/pendientes", label: "Pendientes", icon: FiBookOpen },
      { href: "/dashboard/cobros/vencidos", label: "Vencidos", icon: FiTrendingUp },
      { href: "/dashboard/inscripciones", label: "Inscripciones", icon: FiBookOpen },
      { href: "/dashboard/utiles", label: "Utiles", icon: FiLayers }
    ]
  },
  {
    title: "Finanzas",
    items: [
      { href: "/dashboard/egresos", label: "Egresos", icon: FiDollarSign },
      { href: "/dashboard/contabilidad", label: "Contabilidad", icon: FiTrendingUp }
    ]
  },
  {
    title: "Cuenta",
    items: [{ href: "/dashboard/perfil", label: "Perfil", icon: FiSettings }]
  }
];
