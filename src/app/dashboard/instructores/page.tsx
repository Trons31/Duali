import { redirect } from "next/navigation";

// Spec 024 R8: Instructores vive ahora en Colaboradores.
export default function InstructorsPage() {
  redirect("/dashboard/colaboradores");
}
