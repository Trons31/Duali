// Spec 028: Contabilidad como CliqCut y la cabecera compacta. Chromium real.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser as Chromium, type Page } from "playwright-core";
import { hashPassword, signToken } from "@/lib/auth";
import { studioTodayKey } from "@/lib/studio-time";
import { disconnect, prisma } from "../functional/helpers";
import { createCatalog, createMember, sell } from "../functional/studio-fixtures";
import { BASE_URL, Browser } from "./browser";

const PASSWORD = "Prueba12345!";
// SCREENSHOT_DIR=... guarda cómo se ve, para revisarlo a ojo.
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

let chrome: Chromium;
let cookies: Array<{ name: string; value: string; url: string }> = [];

async function shot(page: Page, name: string) {
  if (!SCREENSHOT_DIR) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
}

before(async () => {
  const client = await prisma.client.create({
    data: {
      nombre: "Dueña Contable",
      email: `contable-${Date.now()}@test.duali`,
      passwordHash: await hashPassword(PASSWORD),
      businessName: "Studio Contable",
      telefono: "3001234567",
      moduloEstudio: true,
      moduloAcademia: false
    }
  });
  const token = signToken(client);
  const catalog = await createCatalog(token);
  const member = await createMember(token, "Lucía");
  await sell(token, member.id, catalog.packages.basicoBodyCombat, { pago: { monto: 55000, metodoPago: "NEQUI" } });
  await prisma.expense.create({
    data: { clientId: client.id, concepto: "Arriendo", monto: 15000, fecha: new Date(`${studioTodayKey()}T17:00:00.000Z`), categoria: "RENT", metodoPago: "EFECTIVO" }
  });
  const instructor = await prisma.instructor.create({ data: { clientId: client.id, nombre: "Mateo", color: "#0ea5e9" } });
  const expense = await prisma.expense.create({
    data: { clientId: client.id, concepto: "Pago a Mateo", monto: 10000, fecha: new Date(), categoria: "COMMISSION", metodoPago: "EFECTIVO" }
  });
  await prisma.instructorPayment.create({
    data: {
      clientId: client.id,
      instructorId: instructor.id,
      tipo: "COMISION",
      monto: 10000,
      fecha: new Date(),
      expenseId: expense.id,
      methods: { create: [{ metodo: "EFECTIVO", monto: 10000 }] }
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

describe("spec 028 · contabilidad", () => {
  test("R4: filtros, tarjetas y pestañas como CliqCut", { timeout: 300_000 }, async () => {
    const context = await chrome.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/dashboard/contabilidad`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Este mes" }).waitFor({ timeout: 60_000 });
    for (const text of ["Egresos operativos", "Pagos a instructores", "Ganancia neta"]) {
      await page.getByText(text, { exact: true }).first().waitFor();
    }
    // Lo que se quitó (D4).
    assert.equal(await page.getByText("Movimientos", { exact: true }).count(), 0);
    // 55.000 de ingresos − 15.000 de arriendo − 10.000 a Mateo.
    await page.getByText("$ 30.000").first().waitFor();
    await shot(page, "contabilidad-resumen");

    await page.getByRole("tab", { name: "Por instructor" }).click();
    await page.getByText("Mateo", { exact: true }).waitFor();
    await shot(page, "contabilidad-instructores");

    await page.getByRole("tab", { name: "Egresos (2)" }).click();
    await page.getByText("Pago registrado", { exact: true }).waitFor();
    await shot(page, "contabilidad-egresos");

    await page.getByRole("button", { name: "Mes pasado" }).click();
    await page.waitForURL(/filter=lastmonth/);
    await page.getByText("Sin egresos en este período").waitFor({ timeout: 30_000 });

    await page.getByRole("button", { name: "Ver por día" }).click();
    await page.waitForURL(/filter=day/);
    await shot(page, "contabilidad-dia");
    await context.close();
  });

  test("R1/R6: cabecera compacta y selects del panel", { timeout: 300_000 }, async () => {
    const context = await chrome.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/dashboard/ventas/cobros?tab=historial`, { waitUntil: "domcontentloaded" });

    const name = page.locator("aside").getByText("Studio Contable").first();
    await name.waitFor({ timeout: 60_000 });
    const box = await name.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]").boundingBox();
    assert.ok(box && box.height <= 125, `la cabecera mide ${box?.height}px`);

    const method = page.getByLabel("Método");
    await method.waitFor();
    assert.equal(await method.evaluate((node) => getComputedStyle(node).appearance), "none", "sin la flecha del navegador");
    await shot(page, "cobros-historial-selects");
    await context.close();
  });
});
