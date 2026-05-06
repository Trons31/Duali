import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/http";
import { auth } from "@/lib/web-auth";

export function isAdminSession(session: Session | null) {
  return session?.user?.role === "ADMIN";
}

export async function requireAdminPage() {
  const session = await auth();
  if (!isAdminSession(session)) redirect("/auth/login");
  return session;
}

export async function requireAdminApi() {
  const session = await auth();
  if (!isAdminSession(session)) throw new ApiError(401, "No autorizado");
  return session;
}
