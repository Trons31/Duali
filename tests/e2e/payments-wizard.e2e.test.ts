// Spec 027: vender varios paquetes y registrar pagos paso a paso, en dos partes.
// Chromium real contra la app de punta a punta.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser as Chromium, type BrowserContext, type Page } from "playwright-core";
import { hashPassword, signToken } from "@/lib/auth";
import { disconnect, prisma } from "../functional/helpers";
import { createCatalog, createMember, sell } from "../functional/studio-fixtures";
import { BASE_URL, Browser } from "./browser";

const PASSWORD = "Prueba12345!";
// SCREENSHOT_DIR=... guarda cada paso, para revisarlo a ojo.
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

let chrome: Chromium;
let context: BrowserContext;
let token = "";
let catalog: Awaited<ReturnType<typeof createCatalog>>;

async function shot(page: Page, name: string) {
  if (!SCREENSHOT_DIR) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
}

before(async () => {
  const client = await prisma.client.create({
    data: {
      nombre: "Dueña Cobros",
      email: `cobros-${Date.now()}@test.duali`,
      passwordHash: await hashPassword(PASSWORD),
      businessName: "Studio Cobros",
      telefono: "3001234567",
      moduloEstudio: true,
      moduloAcademia: false
    }
  });
  token = signToken(client);
  catalog = await createCatalog(token);

  const browser = new Browser();
  await browser.login(client.email, PASSWORD);
  chrome = await chromium.launch().catch((error: Error) => {
    throw new Error(`No se pudo abrir Chromium. En una máquina nueva: npx playwright-core install chromium\n${error.message}`);
  });
  context = await chrome.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(browser.cookieList().map(([name, value]) => ({ name, value, url: BASE_URL })));
});

after(async () => {
  await context?.close();
  await chrome?.close();
  await disconnect();
});

describe("spec 027 · asistentes de venta y pago", () => {
  test("R6/D1: vende Body Combat y Jump Power juntos y cobra en dos partes", { timeout: 300_000 }, async () => {
    const member = await createMember(token, "Camila");
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/dashboard/clientes/${member.id}`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Vender paquete" }).first().click({ timeout: 60_000 });
    const dialog = page.getByRole("dialog", { name: "Vender paquetes" });
    await dialog.waitFor();

    // Paso 1: dos paquetes de disciplinas distintas.
    await dialog.locator("section", { hasText: "Body Combat" }).getByRole("button", { name: /Básico/ }).click();
    await dialog.locator("section", { hasText: "Jump Power" }).getByRole("button", { name: /Básico/ }).click();
    await dialog.getByText("2 paquetes · $ 120.000").waitFor();
    await shot(page, "venta-1-paquetes");
    await dialog.getByRole("button", { name: "Continuar" }).click();

    // Paso 2: detalles de cada uno.
    await dialog.getByLabel("Precio final de Básico").first().waitFor();
    await shot(page, "venta-2-detalles");
    await dialog.getByRole("button", { name: "Continuar" }).click();

    // Paso 3: resumen y pago en dos partes.
    await dialog.getByText("Total de la venta").waitFor();
    await dialog.getByRole("button", { name: "Pago en dos partes" }).click();
    await dialog.getByLabel("Valor del método 1").fill("70000");
    await dialog.getByText("Total recibido").waitFor();
    await shot(page, "venta-3-pago");
    await dialog.getByRole("button", { name: "Vender y cobrar $ 120.000" }).click();
    await dialog.waitFor({ state: "detached", timeout: 30_000 });

    const sales = await prisma.memberPackage.findMany({
      where: { memberId: member.id },
      include: { payments: { include: { methodParts: true } } },
      orderBy: { createdAt: "asc" }
    });
    assert.equal(sales.length, 2);
    assert.deepEqual(sales.map((sale) => Number(sale.pagado)), [55000, 65000]);
    const parts = sales.flatMap((sale) => sale.payments.flatMap((payment) => (payment.methodParts.length ? payment.methodParts : [{ metodo: payment.metodoPago, monto: payment.monto }])));
    const byMethod = (metodo: string) => parts.filter((part) => part.metodo === metodo).reduce((sum, part) => sum + Number(part.monto), 0);
    assert.equal(byMethod("EFECTIVO"), 70000);
    assert.equal(byMethod("NEQUI"), 50000);

    // R10: la tarjeta del plan no tiene pestañas.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Pagos (1)").first().waitFor({ timeout: 60_000 });
    assert.equal(await page.getByRole("tablist", { name: "Detalle del plan" }).count(), 0);
    await shot(page, "ficha-plan");
    await page.close();
  });

  test("R6/D7: registrar un abono con resumen y en dos partes", { timeout: 300_000 }, async () => {
    const member = await createMember(token, "Sofía");
    const sale = await sell(token, member.id, catalog.packages.basicoBodyCombat);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/dashboard/clientes/${member.id}`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Registrar pago" }).first().click({ timeout: 60_000 });
    const dialog = page.getByRole("dialog", { name: "Registrar pago" });
    await dialog.getByText("Saldo pendiente").waitFor();
    await dialog.getByRole("radio", { name: "Abona una parte" }).click();
    await dialog.getByLabel("Monto del abono").fill("30000");
    await shot(page, "pago-1-resumen");
    await dialog.getByRole("button", { name: "Continuar" }).click();

    await dialog.getByText("Confirma cómo recibiste $ 30.000.").waitFor();
    await dialog.getByRole("button", { name: "Pago en dos partes" }).click();
    await dialog.getByLabel("Valor del método 2").fill("10000");
    await shot(page, "pago-2-metodo");
    await dialog.getByRole("button", { name: "Registrar $ 30.000" }).click();
    await dialog.waitFor({ state: "detached", timeout: 30_000 });

    const payment = await prisma.memberPackagePayment.findFirstOrThrow({ where: { memberPackageId: sale.id }, include: { methodParts: true } });
    assert.equal(Number(payment.monto), 30000);
    assert.equal(payment.metodoPago, "MIXTO");
    assert.deepEqual(payment.methodParts.map((part) => [part.metodo, Number(part.monto)]).sort(), [
      ["EFECTIVO", 20000],
      ["NEQUI", 10000]
    ]);
    await page.close();
  });

  test("R9: Ventas › Cobros registra el pago desde Pendientes", { timeout: 300_000 }, async () => {
    const member = await createMember(token, "Valeria");
    const sale = await sell(token, member.id, catalog.packages.basicoRumba);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/dashboard/ventas/cobros`, { waitUntil: "domcontentloaded" });

    const row = page.getByRole("listitem").filter({ hasText: "Valeria" });
    await row.waitFor({ timeout: 60_000 });
    await shot(page, "cobros-pendientes");
    await row.getByRole("button", { name: "Registrar pago" }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar pago" });
    await dialog.getByRole("button", { name: "Continuar" }).click();
    await dialog.getByRole("radio", { name: "Nequi" }).click();
    await dialog.getByRole("button", { name: "Registrar $ 55.000" }).click();
    await dialog.waitFor({ state: "detached", timeout: 30_000 });

    const updated = await prisma.memberPackage.findUniqueOrThrow({ where: { id: sale.id } });
    assert.equal(Number(updated.pagado), 55000);
    await page.close();
  });
});
