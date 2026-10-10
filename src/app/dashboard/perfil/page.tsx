import { redirect } from "next/navigation";

// La pagina se renombro a Ajustes (spec 001); se conserva la ruta vieja para
// no romper enlaces guardados.
export default function ProfilePage() {
  redirect("/dashboard/ajustes");
}
