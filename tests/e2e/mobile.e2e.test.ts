// Spec 025: ninguna pantalla rompe el ancho del celular. Chromium real contra la
// app de punta a punta, con datos que fuerzan los casos difíciles.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser as Chromium } from "playwright-core";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as groupsRoute from "@/app/api/groups/route";
import * as profileRoute from "@/app/api/client/profile/route";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as purchaseRoute from "@/app/api/public/studios/[slug]/plans/route";
import * as studentsRoute from "@/app/api/students/route";
import { hashPassword, signToken } from "@/lib/auth";
import { addDaysToKey, isoWeekday, studioNow } from "@/lib/studio-time";
import { call, disconnect, expectOk, prisma } from "../functional/helpers";
import { createCatalog, createMember, createSchedule, sell } from "../functional/studio-fixtures";
import { BASE_URL, Browser } from "./browser";

// MOBILE_WIDTHS=1280 sirve para revisar escritorio con la misma prueba.
const WIDTHS = (process.env.MOBILE_WIDTHS ?? "320,360,390").split(",").map(Number);
const PASSWORD = "Prueba12345!";
const slug = `movil-e2e-${Date.now()}`;
const PHOTO = `data:image/png;base64,iVBORw0KGgo${"A".repeat(400)}`;

let chrome: Chromium;
let cookies: Array<{ name: string; value: string; url: string }> = [];
let routes: string[] = [];

/**
 * Corre dentro de la página. Va como texto: el transpilador agrega ayudantes
 * (`__name`) que no existen en el navegador.
 */
const FIND_OVERFLOW = `(() => {
  const W = document.documentElement.clientWidth;
  const label = (el) => {
    const cls = typeof el.className === "string" ? el.className.split(" ").slice(0, 6).join(".") : "";
    return el.tagName.toLowerCase() + (cls ? "." + cls : "") + ' "' + (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40) + '"';
  };
  const out = (r) => r.right > W + 1 || r.left < -1;
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll") return true;
    }
    return false;
  };
  const offenders = [];
  for (const el of document.body.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden" || r.width === 0 || r.height === 0) continue;
    if (!out(r) || inScroller(el)) continue;
    // Cajones y menus fijos que esperan fuera de la pantalla.
    if (s.position === "fixed" && (r.left >= W || r.right <= 0)) continue;
    // Solo el elemento donde empieza el desborde, no todos sus hijos.
    if (el.parentElement && out(el.parentElement.getBoundingClientRect()) && !inScroller(el.parentElement)) continue;
    offenders.push(Math.round(r.left) + ".." + Math.round(r.right) + " " + label(el));
  }
  return { scrollWidth: document.documentElement.scrollWidth, width: W, offenders: offenders.slice(0, 5) };
})()`;

before(async () => {
  const client = await prisma.client.create({
    data: {
      nombre: "Daniela Dueña Con Un Nombre Bastante Largo",
      email: `movil-${Date.now()}@test.duali`,
      passwordHash: await hashPassword(PASSWORD),
      businessName: "Studio Dance Academia de Baile Internacional",
      telefono: "3001234567",
      moduloEstudio: true,
      moduloAcademia: true,
      permitirPagoEnEstudio: true
    }
  });
  const token = signToken(client);
  expectOk(
    await call(profileRoute.PUT, {
      token,
      method: "PUT",
      body: { paymentMethodItems: [{ name: "Nequi", account: "300 123 4567" }, { name: "Bancolombia Ahorros", account: "12345678901234" }] }
    })
  );
  const catalog = await createCatalog(token);
  const schedules = await createSchedule(token, catalog.disciplines.bodyCombat, [1, 2, 3, 4, 5, 6, 7], { cupo: 10 });
  await createSchedule(token, catalog.disciplines.jump, [1, 3, 5], { horaInicio: "07:00" });
  expectOk(await call(publicPageRoute.PUT, { token, method: "PUT", body: { slug, paginaPublicaActiva: true } }));

  const members: string[] = [];
  for (const nombre of ["Sofía Martínez Hernández de la Cruz", "Daniela Rojas", "Valentina Ruiz"]) {
    members.push((await createMember(token, nombre)).id);
  }
  await sell(token, members[0], catalog.packages.basicoMix);
  await sell(token, members[1], catalog.packages.basicoJump, { pago: { monto: 65000, metodoPago: "NEQUI" } });

  // El caso de la captura: compró en línea, comprobante por revisar y una clase reservada.
  const purchase = expectOk<{ accessToken: string }>(
    await call(purchaseRoute.POST, {
      token: "",
      method: "POST",
      params: { slug },
      body: {
        packageId: catalog.packages.basicoBodyCombat,
        celular: "3109998877",
        nombre: "Daniel Rivero",
        pago: { tipo: "COMPROBANTE", comprobante: PHOTO, metodo: "Bancolombia Ahorros" }
      }
    }),
    201
  );
  const online = await prisma.memberPackage.findUniqueOrThrow({ where: { accessToken: purchase.accessToken } });
  const classDate = addDaysToKey(studioNow().dateKey, 2);
  const scheduleId = schedules.find((item) => item.diaSemana === isoWeekday(classDate))!.id;
  expectOk(await call(bookingsRoute.POST, { token, method: "POST", body: { scheduleId, fecha: classDate, memberId: online.memberId } }), 201);

  const group = expectOk<{ id: string }>(
    await call(groupsRoute.POST, { token, method: "POST", body: { nombre: "Ballet Infantil Avanzado de los Sábados", precioMensualidadDefault: 120000 } }),
    201
  );
  const now = new Date();
  expectOk(
    await call(studentsRoute.POST, {
      token,
      method: "POST",
      body: {
        nombre: "Juan Sebastián",
        apellido: "Castañeda Villalobos",
        edad: 12,
        esMenorDeEdad: true,
        nombrePadre: "Acudiente Ejemplo",
        telefonoPadre: "3009876543",
        grupoId: group.id,
        tipoRegistro: "ANTIGUO",
        cobraInscripcion: false,
        precioMensualidad: 120000,
        diaCobro: 5,
        inicioClasesDia: 1,
        inicioClasesMes: now.getMonth() === 0 ? 12 : now.getMonth(),
        inicioClasesAnio: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      }
    }),
    201
  );
  const student = await prisma.student.findFirstOrThrow({ where: { clientId: client.id } });

  routes = [
    "/dashboard",
    "/dashboard/ajustes",
    "/dashboard/avisos",
    "/dashboard/clientes",
    "/dashboard/clientes?tab=planes",
    `/dashboard/clientes/${online.memberId}`,
    `/dashboard/clientes/${members[0]}`,
    "/dashboard/cobros/pagos",
    "/dashboard/cobros/pendientes",
    "/dashboard/cobros/vencidos",
    "/dashboard/colaboradores",
    "/dashboard/colaboradores/pagos",
    "/dashboard/contabilidad",
    "/dashboard/contenido",
    "/dashboard/egresos",
    "/dashboard/estudiantes",
    `/dashboard/estudiantes?student=${student.id}`,
    "/dashboard/grupos",
    `/dashboard/grupos/${group.id}`,
    "/dashboard/horario",
    "/dashboard/inscripciones",
    "/dashboard/mi-pagina",
    "/dashboard/mi-plan",
    "/dashboard/notificaciones",
    "/dashboard/paquetes",
    "/dashboard/ventas/cobros",
    "/dashboard/ventas/cobros?tab=historial",
    "/auth/login",
    "/auth/register",
    `/s/${slug}`,
    `/s/${slug}/reservar`,
    `/s/${slug}/plan/${purchase.accessToken}`
  ];

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

describe("spec 025 · móvil sin desbordes", () => {
  for (const width of WIDTHS) {
    test(`a ${width} px ninguna pantalla se sale del ancho`, { timeout: 900_000 }, async () => {
      const context = await chrome.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
      await context.addCookies(cookies);
      const page = await context.newPage();
      const failures: string[] = [];
      try {
        for (const route of routes) {
          const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 180_000 });
          assert.ok(response && response.status() < 400, `${route}: status ${response?.status()}`);
          await page.waitForTimeout(300);
          // MOBILE_SHOTS=carpeta guarda capturas para revisarlas a ojo.
          if (process.env.MOBILE_SHOTS) {
            await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${width}${route.replace(/[^a-z0-9]+/gi, "_")}.png`, fullPage: true });
          }
          const result = (await page.evaluate(FIND_OVERFLOW)) as { scrollWidth: number; width: number; offenders: string[] };
          if (result.scrollWidth > result.width || result.offenders.length) {
            failures.push(`${route} (ancho ${result.scrollWidth} de ${result.width})\n    ${result.offenders.join("\n    ")}`);
          }
        }
      } finally {
        await context.close();
      }
      assert.deepEqual(failures, [], `Se salen del ancho a ${width} px:\n  ${failures.join("\n  ")}`);
    });
  }
});
