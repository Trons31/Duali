import { redirect } from "next/navigation";

// Spec 024 R8: Pagos vive ahora en Colaboradores.
export default function InstructorPaymentsPage() {
  redirect("/dashboard/colaboradores/pagos");
}
