// Un "navegador" minimo para las pruebas de punta a punta: guarda cookies entre
// peticiones y no sigue redirecciones, para poder comprobarlas.

export const BASE_URL = process.env.E2E_BASE_URL ?? "";
if (!BASE_URL.startsWith("http://127.0.0.1:")) {
  throw new Error("Las pruebas e2e solo corren con su propia app local (usa npm run test:e2e).");
}

export class Browser {
  private cookies = new Map<string, string>();

  private store(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
  }

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    const response = await fetch(`${BASE_URL}${path}`, { ...init, headers, redirect: "manual" });
    this.store(response);
    return response;
  }

  async page(path: string) {
    const response = await this.request(path);
    return { status: response.status, location: response.headers.get("location"), html: await response.text() };
  }

  async json(path: string, method: string, body: unknown) {
    const response = await this.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }

  /** Las cookies de la sesion, para pasarlas a un navegador real (spec 025). */
  cookieList() {
    return [...this.cookies];
  }

  /** Inicia sesion con el formulario de credenciales de NextAuth. */
  async login(email: string, password: string) {
    const csrf = await this.request("/api/auth/csrf");
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const response = await this.request("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${BASE_URL}/dashboard` })
    });
    if (![...this.cookies.keys()].some((name) => name.includes("session-token"))) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`No se pudo iniciar sesión (status ${response.status}, location ${response.headers.get("location")}): ${detail}`);
    }
  }
}

/** Texto visible aproximado de un HTML (sin etiquetas ni scripts), para buscar frases. */
export function visibleText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;| /g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
