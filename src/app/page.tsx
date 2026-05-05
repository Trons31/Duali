import { redirect } from "next/navigation";
import { auth } from "@/lib/web-auth";

export default async function Page() {
  const session = await auth();
  redirect(session ? "/dashboard" : "/auth/login");
}
