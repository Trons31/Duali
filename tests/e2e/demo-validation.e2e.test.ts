// Spec 029: con el demo sembrado (spec 016 + escenarios de validación), cada
// pantalla del panel abre sin errores en un navegador real. Es lo que la dueña
// va a recorrer a mano para validar antes de entregar.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser as Chromium, type Page } from "playwright-core";
import { hashPassword } from "@/lib/auth";
import { seedDemoStudio } from "../../scripts/demo-studio";
import { seedDemoValidation } from "../../scripts/demo-validation";
import { disconnect, prisma } from "../functional/helpers";
import { BASE_URL, Browser } from "./browser";

const PASSWORD = "Prueba12345!";
// SCREENSHOT_DIR=... guarda las pantallas clave, para revisarlas a ojo.
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

let chrome: Chromium;
let cookies: Array<{ name: string; value: string; url: string }> = [];
let routes: string[] = [];

before(async () => {
  const email = `demo-e2e-${Date.now()}@test.duali`;
  await prisma.client.create({
    data: {
      nombre: "demo",
      email,
      passwordHash: await hashPassword(PASSWORD),
      businessName: "demo",
      telefono: "3001234567",
      moduloEstudio: true,
      moduloAcademia: false
    }
  });
  const quiet = () => undefined;
  await seedDemoStudio({ apply: true, email, log: quiet });
  const lines: string[] = [];
  await seedDemoValidation({ apply: true, email, log: (line) => lines.push(line) });
  assert.equal(lines.filter((line) => line.includes("!")).length, 0, lines.join("\n"));

  const client = await prisma.client.findFirstOrThrow({ where: { email } });
  const members = await prisma.studioMember.findMany({ where: { clientId: client.id }, select: { id: true } });
  routes = [
    "/dashboard",
    "/dashboard/notificaciones",
    "/dashboard/horario",
    "/dashboard/avisos",
    "/dashboard/clientes",
    "/dashboard/clientes?tab=planes",
    "/dashboard/clientes?tab=sueltas",
    ...members.map((member) => `/dashboard/clientes/${member.id}`),
    "/dashboard/ventas/cobros",
    "/dashboard/ventas/cobros?tab=vencidos",
    "/dashboard/ventas/cobros?tab=revisar",
    "/dashboard/ventas/cobros?tab=historial",
    "/dashboard/paquetes",
    "/dashboard/colaboradores",
    "/dashboard/colaboradores/pagos",
    "/dashboard/mi-pagina",
    "/dashboard/contenido",
    "/dashboard/egresos",
    ...["today", "week", "month", "lastmonth", "specificmonth", "custom", "day", "paymentcycle"].map((filter) => `/dashboard/contabilidad?filter=${filter}`),
    "/dashboard/ajustes",
    "/dashboard/mi-plan"
  ];

  const browser = new Browser();
  await browser.login(email, PASSWORD);
  cookies = browser.cookieList().map(([name, value]) => ({ name, value, url: BASE_URL }));
  chrome = await chromium.launch().catch((error: Error) => {
    throw new Error(`No se pudo abrir Chromium. En una máquina nueva: npx playwright-core install chromium\n${error.message}`);
  });
});

after(async () => {
  await chrome?.close();
  await disconnect();
});

async function shot(page: Page, name: string) {
  if (!SCREENSHOT_DIR) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}

describe("spec 029 · el demo sembrado abre sin errores", () => {
  test("cada pantalla del panel carga, sin errores de página ni de consola", { timeout: 900_000 }, async () => {
    const context = await chrome.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addCookies(cookies);
    const page = await context.newPage();
    const problems: string[] = [];
    let current = "";
    page.on("pageerror", (error) => problems.push(`${current}: ${error.message}`));
    page.on("console", (message) => {
      // El aviso de recarga en caliente del modo desarrollo no es de la app.
      if (message.type() === "error" && !/webpack-hmr|_next\/hmr|WebSocket/.test(message.text())) problems.push(`${current}: ${message.text()}`);
    });

    for (const route of routes) {
      current = route;
      const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "load", timeout: 120_000 });
      assert.ok(response && response.status() < 400, `${route} respondió ${response?.status()}`);
      await page.waitForTimeout(300);
      assert.equal(await page.getByText("Algo salió mal").count(), 0, `${route} muestra la pantalla de error`);
    }
    assert.deepEqual(problems, []);

    // Las pantallas del día de pago.
    for (const [route, name] of [
      ["/dashboard/colaboradores/pagos", "pagos-instructores"],
      ["/dashboard/contabilidad", "contabilidad"],
      ["/dashboard/contabilidad?filter=paymentcycle", "contabilidad-ciclo"],
      ["/dashboard/ventas/cobros", "cobros"],
      ["/dashboard", "inicio"]
    ]) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "load" });
      await shot(page, name);
    }
    await context.close();
  });
});
