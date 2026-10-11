// Spec 026: la invitación propia aparece antes que el diálogo del navegador.
// Chromium real contra la app de punta a punta.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser as Chromium, type BrowserContext } from "playwright-core";
import { hashPassword } from "@/lib/auth";
import { disconnect, prisma } from "../functional/helpers";
import { BASE_URL, Browser } from "./browser";

const PASSWORD = "Prueba12345!";
// SCREENSHOT_DIR=... guarda cómo se ve el modal, para revisarlo a ojo.
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

let chrome: Chromium;
let cookies: Array<{ name: string; value: string; url: string }> = [];

/**
 * Chromium sin ventana responde "denied" de entrada; aquí se simula un navegador
 * que aún no ha decidido, y se cuentan las veces que la página pide el permiso.
 */
const SPY_PERMISSION = `(() => {
  window.__permissionRequests = 0;
  Object.defineProperty(Notification, "permission", { configurable: true, get: () => "default" });
  Notification.requestPermission = () => {
    window.__permissionRequests += 1;
    return Promise.resolve("default");
  };
})()`;

async function openDashboard(context: BrowserContext, path = "/dashboard") {
  const page = await context.newPage();
  await page.addInitScript(SPY_PERMISSION);
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  return page;
}

before(async () => {
  const client = await prisma.client.create({
    data: {
      nombre: "Dueña Notificaciones",
      email: `notif-${Date.now()}@test.duali`,
      passwordHash: await hashPassword(PASSWORD),
      businessName: "Studio Avisos",
      telefono: "3001234567",
      moduloEstudio: true
    }
  });

  const browser = new Browser();
  await browser.login(client.email, PASSWORD);
  cookies = browser.cookieList().map(([name, value]) => ({ name, value, url: BASE_URL }));
  chrome = await chromium.launch().catch((error: Error) => {
    throw new Error(`No se pudo abrir Chromium. En una máquina nueva: npx playwright-core install chromium\n${error.message}`);
  });
});

after(async () => {
  await chrome?.close();
  await disconnect();
});

describe("spec 026 · invitación a activar notificaciones", () => {
  test("R1/R2/R4: sale el modal de Duali, no el navegador, y 'Ahora no' se recuerda", { timeout: 300_000 }, async () => {
    for (const width of [390, 1280]) {
      const context = await chrome.newContext({ viewport: { width, height: 800 } });
      await context.addCookies(cookies);
      try {
        const page = await openDashboard(context);
        const dialog = page.getByRole("dialog", { name: "Activa las notificaciones de tu estudio" });
        await dialog.waitFor({ timeout: 60_000 });
        assert.equal(await page.evaluate("window.__permissionRequests"), 0, "el navegador no debe preguntar solo");
        // Tras la animación de entrada (150 ms), para que la captura sea la real.
        if (SCREENSHOT_DIR) await page.waitForTimeout(400).then(() => page.screenshot({ path: `${SCREENSHOT_DIR}/notificaciones-${width}.png` }));

        await dialog.getByRole("button", { name: "Ahora no" }).click();
        await dialog.waitFor({ state: "detached" });

        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4_000);
        assert.equal(await page.getByRole("dialog").count(), 0, "no vuelve a salir tras 'Ahora no'");
      } finally {
        await context.close();
      }
    }
  });

  test("R1/R6: 'Activar' pide el permiso y Notificaciones permite reabrirlo", { timeout: 300_000 }, async () => {
    const context = await chrome.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies(cookies);
    try {
      const page = await openDashboard(context);
      const dialog = page.getByRole("dialog", { name: "Activa las notificaciones de tu estudio" });
      await dialog.waitFor({ timeout: 60_000 });
      await dialog.getByRole("button", { name: "Activar" }).click();
      await dialog.waitFor({ state: "detached" });
      assert.equal(await page.evaluate("window.__permissionRequests"), 1);

      // Ya se preguntó: solo vuelve desde el botón de la pantalla de Notificaciones.
      await page.goto(`${BASE_URL}/dashboard/notificaciones`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Activar en este dispositivo" }).click();
      await dialog.waitFor({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });
});
