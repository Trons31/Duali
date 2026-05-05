import { WebApiError } from "@/lib/web-api-errors";

export async function clientApiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const requestHeaders = new Headers(init?.headers);
  requestHeaders.set("authorization", `Bearer ${token}`);

  if (init?.body && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers: requestHeaders,
    cache: "no-store"
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new WebApiError(payload?.error ?? "No se pudo completar la solicitud", response.status);
  }

  return (payload?.data ?? payload) as T;
}
