import { redirect } from "next/navigation";

// Spec 019 D1: "Paquetes vendidos" ahora es la pestana Planes de Clientes.
export default function MemberSalesPage() {
  redirect("/dashboard/clientes?tab=planes");
}
