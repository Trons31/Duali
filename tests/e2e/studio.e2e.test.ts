// Punta a punta: la app real (next dev) contra la base temporal, por HTTP.
// Cubre proxy, render de paginas (servidor) y API juntos para specs 001–009.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as postsRoute from "@/app/api/content-posts/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import { hashPassword } from "@/lib/auth";
import { addDaysToKey, isoWeekday, studioNow } from "@/lib/studio-time";
import { call, disconnect, expectOk, prisma } from "../functional/helpers";
import { createCatalog, createMember, createSchedule, sell } from "../functional/studio-fixtures";
import { signToken } from "@/lib/auth";
import { Browser, visibleText } from "./browser";

after(disconnect);

const PASSWORD = "Prueba12345!";
const slug = `studiodance-e2e-${Date.now()}`;
let owner: { id: string; email: string; token: string };
let memberId = "";
let classDate = "";
let scheduleForDate = "";

before(async () => {
  const client = await prisma.client.create({
    data: {
      nombre: "Daniela Dueña",
      email: `e2e-${Date.now()}@test.duali`,
      passwordHash: await hashPassword(PASSWORD),
      businessName: "Studio Dance E2E",
      telefono: "3001234567",
      moduloEstudio: true,
      paymentMethodItems: [{ name: "Nequi", account: "3001234567" }]
    }
  });
  owner = { id: client.id, email: client.email, token: signToken(client) };

  const catalog = await createCatalog(owner.token);
  const schedules = await createSchedule(owner.token, catalog.disciplines.bodyCombat, [1, 2, 3, 4, 5, 6, 7], { cupo: 10 });
  classDate = addDaysToKey(studioNow().dateKey, 2);
  scheduleForDate = schedules.find((item) => item.diaSemana === isoWeekday(classDate))!.id;

  const member = await createMember(owner.token, "Laura");
  memberId = member.id;
  await sell(owner.token, member.id, catalog.packages.basicoBodyCombat, { pago: { monto: 30000, metodoPago: "NEQUI" } });
  expectOk(
    await call(bookingsRoute.POST, { token: owner.token, method: "POST", body: { scheduleId: scheduleForDate, fecha: classDate, memberId } }),
    201
  );
  expectOk(await call(publicPageRoute.PUT, { token: owner.token, method: "PUT", body: { slug, paginaPublicaActiva: true } }));

  // Spec 010: una novedad publicada (video de YouTube) y un borrador.
  expectOk(
    await call(postsRoute.POST, {
      token: owner.token,
      method: "POST",
      body: { tipo: "VIDEO", titulo: "Así es Jump Power", enlaceVideo: "https://youtu.be/dQw4w9WgXcQ", publicado: true }
    }),
    201
  );
  expectOk(
    await call(postsRoute.POST, {
      token: owner.token,
      method: "POST",
      body: { tipo: "PUBLICACION", titulo: "Borrador secreto", cuerpo: "Aún no", publicado: false }
    }),
    201
  );
});

describe("proxy: qué pide sesión y qué no", () => {
  test("el panel sin sesión manda al login", async () => {
    const response = await new Browser().page("/dashboard/paquetes");
    assert.ok([302, 307, 308].includes(response.status), `status ${response.status}`);
    assert.match(response.location ?? "", /\/auth\/login/);
  });

  test("la página pública se ve sin sesión", async () => {
    const response = await new Browser().page(`/s/${slug}`);
    assert.equal(response.status, 200);
  });
});

describe("spec 008 · página pública renderizada", () => {
  test("muestra negocio, horario con cupos, precios y cómo pagar; nunca nombres de clientes", async () => {
    const { status, html } = await new Browser().page(`/s/${slug}`);
    assert.equal(status, 200);
    const text = visibleText(html);
    for (const expected of ["Studio Dance E2E", "Reservar clase", "Horario", "Planes", "Body Combat", "Mix Studio", "Básico", "Cómo pagar", "Nequi", "Copiar"]) {
      assert.ok(text.includes(expected), `falta "${expected}"`);
    }
    assert.match(text, /55\.000/);
    assert.match(text, /Quedan 9 cupos/, "la clase con 1 reserva de 10 cupos");
    assert.equal(text.includes("Laura"), false, "no expone clientes");
    assert.match(html, /<title>[^<]*Studio Dance E2E/);
  });

  test("spec 010: novedades publicadas con su video; los borradores no", async () => {
    const { html } = await new Browser().page(`/s/${slug}`);
    const text = visibleText(html);
    assert.ok(text.includes("Novedades"));
    assert.ok(text.includes("Así es Jump Power"));
    assert.equal(text.includes("Borrador secreto"), false);
    assert.match(html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  });

  test("spec 012: portada con datos reales, reservar desde cada clase y mejor valor", async () => {
    const { html } = await new Browser().page(`/s/${slug}`);
    const text = visibleText(html);
    // Disciplinas tipo clase del catálogo de prueba y el plan más barato (Individual, $15.000).
    assert.match(text, /Body Combat, Rumba Fit y Jump Power/);
    assert.match(text, /Desde \$15\.000/);
    assert.match(text, /\d+ clases esta semana/);
    // Cada clase disponible enlaza al asistente con su horario y fecha.
    assert.ok(html.includes(`/s/${slug}/reservar?h=${scheduleForDate}&amp;f=${classDate}`), "falta el enlace Reservar de la clase");
    // Body Combat: Individual 15.000/clase vs Básico 13.750/clase → Básico es mejor valor.
    assert.match(text, /Mejor valor/);
    assert.match(text, /\$13\.750 por clase/);
    // Elegir un plan abre el asistente con el plan preseleccionado.
    assert.ok(html.includes(`/s/${slug}/reservar?plan=`), "falta el enlace Elegir este plan");
  });

  test("spec 012: con ?h&f el asistente abre directo en Tus datos", async () => {
    const { status, html } = await new Browser().page(`/s/${slug}/reservar?h=${scheduleForDate}&f=${classDate}`);
    assert.equal(status, 200);
    const text = visibleText(html);
    assert.match(text, /Tus datos/);
    assert.equal(text.includes("Elige tu clase"), false);
  });

  test("una dirección que no existe responde 404", async () => {
    const response = await new Browser().page("/s/no-existe-este-estudio");
    assert.equal(response.status, 404);
  });
});

describe("spec 009 · una visitante reserva de punta a punta", () => {
  test("asistente, reserva por la API pública y página de su reserva", async () => {
    const visitor = new Browser();
    const wizard = await visitor.page(`/s/${slug}/reservar`);
    assert.equal(wizard.status, 200);
    assert.match(visibleText(wizard.html), /Elige tu clase/);

    const base = { scheduleId: scheduleForDate, fecha: classDate, celular: "3115550199", nombre: "Valentina" };
    const needs = await visitor.json(`/api/public/studios/${slug}/bookings`, "POST", base);
    assert.equal(needs.status, 200);
    assert.equal(needs.body.data.estado, "NECESITA_PAQUETE");

    const dropIn = needs.body.data.opciones.find((item: { clases: number }) => item.clases === 1);
    const booked = await visitor.json(`/api/public/studios/${slug}/bookings`, "POST", { ...base, packageId: dropIn.id });
    assert.equal(booked.status, 201);
    const token: string = booked.body.data.accessToken;

    const manage = await visitor.page(`/s/${slug}/reserva/${token}`);
    assert.equal(manage.status, 200);
    const text = visibleText(manage.html);
    assert.match(text, /Cupo apartado/);
    assert.match(text, /Hola, Valentina/);
    assert.match(text, /15\.000/);

    // El token no sirve con la dirección de otro estudio.
    assert.equal((await visitor.page(`/s/otro-estudio/reserva/${token}`)).status, 404);

    // Spec 014: con saldo, su reserva ofrece adjuntar el comprobante; al adjuntarlo la dueña lo ve.
    assert.match(text, /Comprobante de pago/);
    assert.match(text, /Elegir foto o captura del comprobante/);
    const publicId = `duali/negocios/${owner.id}/imagenes/comprobantes/e2e`;
    const attached = await visitor.json(`/api/public/bookings/${token}/receipts`, "POST", {
      url: `https://res.cloudinary.com/duali-test/image/upload/v1/${publicId}.jpg`,
      publicId
    });
    assert.equal(attached.status, 201);
    assert.match(visibleText((await visitor.page(`/s/${slug}/reserva/${token}`)).html), /Enviado, en revisión/);

    // La ocupación pública ya cuenta la nueva reserva.
    assert.match(visibleText((await visitor.page(`/s/${slug}`)).html), /Quedan 8 cupos/);
  });
});

describe("spec 016 · logo nuevo", () => {
  test("login y página pública usan el logo DU vectorial; el archivo de imagen viejo ya no se pide", async () => {
    for (const path of ["/auth/login", `/s/${slug}`]) {
      const { status, html } = await new Browser().page(path);
      assert.equal(status, 200);
      assert.match(html, /aria-label="Duali"[^>]*viewBox="0 0 89 50"/, `${path}: falta el logo`);
      assert.match(html, /#22d3ee/);
      assert.equal(html.includes("y5lrqo"), false);
    }
    const icon = await new Browser().request("/logo/icon.svg");
    assert.equal(icon.status, 200);
  });
});

describe("spec 017 · navegación de la página pública", () => {
  test("menú centrado en la barra, botón del menú del celular y sin Cómo pagar en la barra", async () => {
    const { status, html } = await new Browser().page(`/s/${slug}`);
    assert.equal(status, 200);
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    for (const label of ["Horario", "Clases", "Planes"]) assert.ok(header.includes(`>${label}</a>`), `falta ${label} en la barra`);
    assert.equal(header.includes("Cómo pagar"), false);
    assert.match(header, /aria-label="Abrir menú"/);
    // La sección de pagos sigue en la página.
    assert.match(html, /id="pagos"/);
  });
});

describe("spec 015 · lista de espera de punta a punta", () => {
  test("clase llena: se anota, ve su puesto y al cancelarse un cupo su enlace lleva a la reserva", async () => {
    const fecha = addDaysToKey(studioNow().dateKey, 3);
    const scheduleId = (await prisma.classSchedule.findFirstOrThrow({ where: { clientId: owner.id, diaSemana: isoWeekday(fecha) } })).id;
    expectOk(await call(sessionsRoute.PUT, { token: owner.token, method: "PUT", body: { scheduleId, fecha, cupo: 1 } }));

    const visitor = new Browser();
    const options = await visitor.json(`/api/public/studios/${slug}/bookings`, "POST", { scheduleId, fecha, celular: "3115550301", nombre: "Ana" });
    const dropIn = options.body.data.opciones.find((item: { clases: number }) => item.clases === 1);
    const ana = await visitor.json(`/api/public/studios/${slug}/bookings`, "POST", { scheduleId, fecha, celular: "3115550301", nombre: "Ana", packageId: dropIn.id });
    assert.equal(ana.status, 201);

    const home = visibleText((await visitor.page(`/s/${slug}`)).html);
    assert.match(home, /Lleno · lista de espera/);
    assert.match(home, /Anotarme/);
    const wizard = visibleText((await visitor.page(`/s/${slug}/reservar?h=${scheduleId}&f=${fecha}`)).html);
    assert.match(wizard, /Unirme a la lista de espera/);
    assert.match(wizard, /Esta clase está llena/);

    const joined = await visitor.json(`/api/public/studios/${slug}/waitlist`, "POST", {
      scheduleId,
      fecha,
      celular: "3115550302",
      nombre: "Sofía",
      packageId: dropIn.id
    });
    assert.equal(joined.status, 201);
    assert.equal(joined.body.data.posicion, 1);
    const link = `/s/${slug}/espera/${joined.body.data.accessToken}`;
    const waiting = await visitor.page(link);
    assert.equal(waiting.status, 200);
    assert.match(visibleText(waiting.html), /En lista de espera · puesto 1/);
    assert.match(visibleText(waiting.html), /Salir de la lista de espera/);

    assert.equal((await visitor.json(`/api/public/bookings/${ana.body.data.accessToken}`, "PUT", { cancelar: true })).status, 200);
    const assigned = await visitor.page(link);
    assert.equal(assigned.status, 307);
    assert.match(assigned.location ?? "", new RegExp(`/s/${slug}/reserva/`));
    const reserva = visibleText((await visitor.page(new URL(assigned.location!, "http://x").pathname)).html);
    assert.match(reserva, /Cupo apartado/);
    assert.match(reserva, /Hola, Sofía/);
  });
});

describe("panel de la dueña (specs 001–008)", () => {
  const pages: Array<[string, string[]]> = [
    ["/dashboard/ajustes", ["Ajustes", "Tipo de negocio", "Academia + Estudio", "Reservas", "Información", "Métodos de pago"]],
    ["/dashboard/paquetes", ["Paquetes", "Precios", "Disciplinas", "Body Combat", "Mix Studio"]],
    ["/dashboard/horario", ["Horario de clases", "Semana", "Horarios fijos", "Body Combat"]],
    ["/dashboard/clientes", ["Clientes", "Laura", "Con saldo"]],
    // Spec 019: pestañas generales de Clientes.
    ["/dashboard/clientes?tab=planes", ["Clientes", "Planes", "Clases sueltas", "Vigentes", "Por cobrar", "Vendido este mes", "Laura", "Quedan 3 de 4"]],
    ["/dashboard/clientes?tab=sueltas", ["Clases sueltas", "Por usar", "Usadas"]],
    ["/dashboard/horario?vista=asistencia", ["Horario de clases", "Asistencia", "Hoy"]],
    ["/dashboard/mi-pagina", ["Página pública", "Publicada", "Dirección", "Portada"]],
    ["/dashboard/contenido", ["Contenido", "Así es Jump Power", "Borrador secreto", "Publicada", "Borrador"]],
    ["/dashboard/avisos", ["Avisos", "Comprobantes por revisar", "Valentina", "Aprobar", "Clases de mañana", "Paquetes por vencer", "Saldos pendientes", "Laura", "WhatsApp", "Cupos de la lista de espera", "Sofía"]],
    ["/dashboard/contabilidad", []],
    ["/dashboard", ["Academia + Estudio", "Plan · ", "Estudio", "Academia", "Clases de hoy", "Ocupación semana", "Para atender", "comprobantes de pago por revisar", "Reservas recientes en línea", "Valentina"]],
    ["/dashboard?vista=academia", ["Este es el resumen de tu negocio hoy."]]
  ];

  let browser: Browser;
  before(async () => {
    browser = new Browser();
    await browser.login(owner.email, PASSWORD);
  });

  for (const [path, expected] of pages) {
    test(`${path} carga sin errores`, async () => {
      const { status, html } = await browser.page(path);
      assert.equal(status, 200, `${path} respondió ${status}`);
      const text = visibleText(html);
      assert.equal(/Error interno|Application error|Something went wrong/i.test(text), false, `${path} muestra un error`);
      for (const item of expected) assert.ok(text.includes(item), `${path}: falta "${item}"`);
    });
  }

  test("la ficha del cliente muestra paquete, saldo y la próxima reserva", async () => {
    const { status, html } = await browser.page(`/dashboard/clientes/${memberId}`);
    assert.equal(status, 200);
    const text = visibleText(html);
    for (const expected of ["Laura", "Saldo pendiente", "Básico", "Próximas reservas", "Vender paquete", "Quedan 3 de 4", "1 reservada", "Clases (1)"]) {
      assert.ok(text.includes(expected), `falta "${expected}"`);
    }
  });

  test("una ficha que no existe da 404", async () => {
    assert.equal((await browser.page("/dashboard/clientes/no-existe")).status, 404);
  });

  test("el menú muestra las secciones del estudio y CUENTA como en CliqCut", async () => {
    const text = visibleText((await browser.page("/dashboard/ajustes")).html);
    for (const expected of ["AGENDA", "Horario de clases", "Avisos", "VENTAS", "Clientes", "Paquetes y precios", "MI PÁGINA", "Contenido", "CUENTA", "Mi Plan"]) {
      assert.ok(text.includes(expected), `falta "${expected}"`);
    }
    assert.equal(text.includes("Paquetes vendidos"), false, "spec 019: Paquetes vendidos es la pestaña Planes");
  });

  test("spec 019: /dashboard/ventas lleva a Clientes › Planes", async () => {
    const response = await browser.page("/dashboard/ventas");
    assert.ok([302, 303, 307, 308].includes(response.status), `status ${response.status}`);
    assert.match(response.location ?? "", /\/dashboard\/clientes\?tab=planes/);
  });

  test("/dashboard/perfil redirige a Ajustes", async () => {
    const response = await browser.page("/dashboard/perfil");
    assert.ok([302, 303, 307, 308].includes(response.status), `status ${response.status}`);
    assert.match(response.location ?? "", /\/dashboard\/ajustes/);
  });

  test("con el módulo Estudio apagado, sus pantallas muestran el aviso", async () => {
    await prisma.client.update({ where: { id: owner.id }, data: { moduloEstudio: false } });
    try {
      const text = visibleText((await browser.page("/dashboard/paquetes")).html);
      assert.match(text, /Activa el módulo Estudio/);
      assert.equal(text.includes("Paquetes y precios"), false, "el menú ya no muestra VENTAS");
      // Spec 013: solo Academia → el Inicio de siempre, sin selector.
      const home = visibleText((await browser.page("/dashboard")).html);
      assert.match(home, /Este es el resumen de tu negocio hoy\./);
      assert.equal(home.includes("Clases de hoy"), false);
    } finally {
      await prisma.client.update({ where: { id: owner.id }, data: { moduloEstudio: true } });
    }
  });
});
