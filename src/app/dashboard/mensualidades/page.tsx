import { redirect } from "next/navigation";

export default function MonthlyPaymentsPage() {
  redirect("/dashboard/cobros/pendientes");
}
