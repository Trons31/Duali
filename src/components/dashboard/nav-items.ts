import {
  FiBell,
  FiBookOpen,
  FiCheckCircle,
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
    title: "PRINCIPAL",
    items: [
      { href: "/dashboard", label: "Inicio", icon: FiGrid },
      { href: "/dashboard/notificaciones", label: "Notificaciones", icon: FiBell }
    ]
  },
  {
    title: "ACADEMIA",
    items: [
      { href: "/dashboard/estudiantes", label: "Estudiantes", icon: FiUsers },
      { href: "/dashboard/grupos", label: "Grupos", icon: FiLayers }
    ]
  },
  {
    title: "COBROS",
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
      { href: "/dashboard/mi-plan", label: "Mi plan", icon: FiCreditCard },
      { href: "/dashboard/perfil", label: "Perfil", icon: FiSettings }
    ]
  }
];
