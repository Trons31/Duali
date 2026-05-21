import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/web-auth";
import { WebApiError } from "@/lib/web-api-errors";
import { getAppBaseUrl } from "@/lib/web-utils";

async function getServerBaseUrl() {
  const headerStore = await headers();
  return getAppBaseUrl(headerStore.get("host"), headerStore.get("x-forwarded-proto"));
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await auth();
  const token = session?.user?.role === "CLIENT" ? session.user.apiToken : "";

  if (!token) {
    redirect("/auth/login?session=expired");
  }

  const baseUrl = await getServerBaseUrl();
  const requestHeaders = new Headers(init?.headers);
  requestHeaders.set("authorization", `Bearer ${token}`);

  if (init?.body && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: requestHeaders,
    cache: "no-store"
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 401) {
    redirect("/auth/login?session=expired");
  }

  if (!response.ok) {
    throw new WebApiError(payload?.error ?? "No se pudo completar la solicitud", response.status);
  }

  return (payload?.data ?? payload) as T;
}
