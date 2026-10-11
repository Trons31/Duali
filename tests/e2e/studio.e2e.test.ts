// Punta a punta: la app real (next dev) contra la base temporal, por HTTP.
// Cubre proxy, render de paginas (servidor) y API juntos para specs 001–009.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as bookingsRoute from "@/app/api/bookings/route";
import * as paymentRoute from "@/app/api/member-packages/[id]/payments/[paymentId]/route";
import * as postsRoute from "@/app/api/content-posts/route";
import * as sessionsRoute from "@/app/api/class-sessions/route";
import * as instructorsRoute from "@/app/api/instructors/route";
import * as paySettingsRoute from "@/app/api/instructor-payments/settings/route";
import * as collaboratorsRoute from "@/app/api/collaborators/route";
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
      // Spec 021 D2: la visitante del flujo 009 aparta y paga en el estudio.
      permitirPagoEnEstudio: true,
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
  test("muestra negocio, horario con cupos y precios; nunca nombres de clientes", async () => {
    const { status, html } = await new Browser().page(`/s/${slug}`);
    assert.equal(status, 200);
    const text = visibleText(html);
    for (const expected of ["Studio Dance E2E", "Reservar clase", "Horario", "Planes", "Body Combat", "Mix Studio", "Básico"]) {
      assert.ok(text.includes(expected), `falta "${expected}"`);
    }
    // Las cuentas se muestran en el paso Pago (spec 021), no en la portada.
    assert.equal(text.includes("Cómo pagar"), false);
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
    // Spec 021 D1: elegir un plan lo compra, sin pasar por el calendario.
    assert.ok(html.includes(`/s/${slug}/comprar?p=`), "falta el enlace Elegir este plan");
    assert.equal(html.includes(`/s/${slug}/reservar?plan=`), false);
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
    const booked = await visitor.json(`/api/public/studios/${slug}/bookings`, "POST", { ...base, packageId: dropIn.id, pago: { tipo: "EN_ESTUDIO" } });
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
    const icon = await new Browser().request("/logo/duali-icon.svg");
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
    const ana = await visitor.json(`/api/public/studios/${slug}/bookings`, "POST", { scheduleId, fecha, celular: "3115550301", nombre: "Ana", packageId: dropIn.id, pago: { tipo: "EN_ESTUDIO" } });
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
    // Spec 022: resumen arriba, el plan con su accion principal y los desplegables.
    for (const expected of ["Laura", "clases disponibles", "debe · antes del", "Plan actual", "Básico", "Próximas clases", "Vender paquete", "Quedan 3 de 4", "1 reservada", "Ver clases (1)", "Pagos (1)", "Registrar pago", "Más"]) {
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

describe("spec 021 · comprar un plan en línea y Mi plan", () => {
  const PHOTO = `data:image/png;base64,iVBORw0KGgo${"A".repeat(400)}`;
  let planId = "";
  let planToken = "";

  before(async () => {
    const plans = (await prisma.package.findMany({ where: { clientId: owner.id, nombre: "Básico", visiblePublico: true }, select: { id: true } }));
    planId = plans[0].id;
  });

  test("Elegir este plan abre Comprar plan: datos y pago, sin calendario", async () => {
    const { status, html } = await new Browser().page(`/s/${slug}/comprar?p=${planId}`);
    assert.equal(status, 200);
    const text = visibleText(html);
    for (const expected of ["Tus datos", "Básico", "Continuar al pago", "Paso 1 de 2"]) assert.ok(text.includes(expected), `falta "${expected}"`);
    assert.equal(text.includes("Elige tu clase"), false);
  });

  test("los enlaces viejos ?plan= llevan a comprar; un plan que no existe vuelve a los planes", async () => {
    const old = await new Browser().page(`/s/${slug}/reservar?plan=${planId}`);
    assert.ok([302, 303, 307, 308].includes(old.status), `status ${old.status}`);
    assert.ok((old.location ?? "").includes(`/s/${slug}/comprar?p=${planId}`), `location ${old.location}`);
    const missing = await new Browser().page(`/s/${slug}/comprar?p=no-existe`);
    assert.ok([302, 303, 307, 308].includes(missing.status), `status ${missing.status}`);
    assert.match(missing.location ?? "", /#planes/);
  });

  test("compra con comprobante → Mi plan → reservar con el plan sin datos", async () => {
    const visitor = new Browser();
    const bought = await visitor.json(`/api/public/studios/${slug}/plans`, "POST", {
      packageId: planId,
      celular: "3115550277",
      nombre: "Paula",
      pago: { tipo: "COMPROBANTE", comprobante: PHOTO, metodo: "Nequi" }
    });
    assert.equal(bought.status, 201, JSON.stringify(bought.body));
    planToken = bought.body.data.accessToken;

    const mine = await visitor.page(`/s/${slug}/plan/${planToken}`);
    assert.equal(mine.status, 200);
    const text = visibleText(mine.html);
    for (const expected of ["Hola, Paula", "Te quedan 4 de 4", "Pago en revisión", "Reservar con este plan", "Guarda este enlace"]) {
      assert.ok(text.includes(expected), `Mi plan: falta "${expected}"`);
    }
    assert.equal((await visitor.page(`/s/${slug}/plan/token-inventado-123456`)).status, 404);
    assert.equal((await visitor.page(`/s/otro-estudio/plan/${planToken}`)).status, 404);

    const wizard = await visitor.page(`/s/${slug}/reservar?mp=${planToken}`);
    assert.equal(wizard.status, 200);
    const wizardText = visibleText(wizard.html);
    assert.match(wizardText, /Elige tu clase/);
    assert.equal(wizardText.includes("Tus datos"), false);

    const booked = await visitor.json(`/api/public/studios/${slug}/bookings`, "POST", { scheduleId: scheduleForDate, fecha: classDate, planToken });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    assert.equal(booked.body.data.paquete.clasesRestantes, 3);
    assert.match(visibleText((await visitor.page(`/s/${slug}/plan/${planToken}`)).html), /Te quedan 3 de 4/);
  });

  test("la dueña ve la compra en línea por revisar", async () => {
    const browser = new Browser();
    await browser.login(owner.email, PASSWORD);
    const text = visibleText((await browser.page("/dashboard/avisos")).html);
    assert.ok(text.includes("Compró en línea"), "falta la etiqueta Compró en línea");
    assert.ok(text.includes("Paula"));
    const plans = visibleText((await browser.page("/dashboard/clientes?tab=planes")).html);
    assert.ok(plans.includes("Pago en revisión"), "falta el filtro Pago en revisión");
  });
});

describe("spec 020 · renovaciones, pagos y vencimientos", () => {
  const PHOTO = `data:image/png;base64,iVBORw0KGgo${"A".repeat(400)}`;
  let renataId = "";
  let browser: Browser;

  before(async () => {
    const plan = await prisma.package.findFirstOrThrow({ where: { clientId: owner.id, nombre: "Básico", clases: 4 }, select: { id: true } });
    const renata = await createMember(owner.token, "Renata");
    renataId = renata.id;
    // Venció hace 10 días y no pagó: plan vencido sin renovar y saldo vencido.
    await sell(owner.token, renata.id, plan.id, { inicio: addDaysToKey(studioNow().dateKey, -39) });
    browser = new Browser();
    await browser.login(owner.email, PASSWORD);
  });

  test("spec 027: Ventas › Cobros reúne pendientes, vencidos, por revisar e historial", async () => {
    // La pestaña vieja Clientes › Pagos lleva al Historial de Cobros.
    const old = await browser.page("/dashboard/clientes?tab=pagos");
    assert.ok([303, 307, 308].includes(old.status), `esperaba redirección y llegó ${old.status}`);
    assert.match(old.location ?? "", /\/dashboard\/ventas\/cobros\?tab=historial/);

    const pending = await browser.page("/dashboard/ventas/cobros");
    assert.equal(pending.status, 200);
    const text = visibleText(pending.html);
    for (const expected of ["Cobros", "Por cobrar", "Vencido", "Cobrado este mes", "Pendientes", "Vencidos", "Por revisar", "Historial", "Registrar pago"]) {
      assert.ok(text.includes(expected), `Cobros: falta "${expected}"`);
    }

    const history = visibleText((await browser.page("/dashboard/ventas/cobros?tab=historial")).html);
    for (const expected of ["Hoy", "Laura", "Nequi", "Todos los métodos"]) {
      assert.ok(history.includes(expected), `Historial: falta "${expected}"`);
    }
  });

  test("el filtro Vencidos sin renovar y la ficha con Registrar pago, Renovar y el menú Más", async () => {
    const list = visibleText((await browser.page("/dashboard/clientes")).html);
    assert.ok(list.includes("Vencidos sin renovar"), "falta el filtro");
    assert.match(list, /Renata[\s\S]*venció hace 10 días/);

    const card = visibleText((await browser.page(`/dashboard/clientes/${renataId}`)).html);
    for (const expected of ["Venció hace 10 días", "Saldo vencido hace", "saldo vencido", "Registrar pago", "Renovar", "Más"]) {
      assert.ok(card.includes(expected), `ficha: falta "${expected}"`);
    }
  });

  test("Avisos e Inicio muestran vencidos sin renovar y saldos vencidos; Ajustes, el plazo", async () => {
    const avisos = visibleText((await browser.page("/dashboard/avisos")).html);
    for (const expected of ["Planes vencidos sin renovar", "Saldos vencidos", "Renata"]) assert.ok(avisos.includes(expected), `Avisos: falta "${expected}"`);
    const home = visibleText((await browser.page("/dashboard")).html);
    assert.ok(home.includes("saldo"), "Inicio: falta saldos vencidos");
    const ajustes = visibleText((await browser.page("/dashboard/ajustes")).html);
    assert.ok(ajustes.includes("Plazo para pagar el saldo"), "Ajustes: falta el plazo");
  });

  test("Mi plan vencido ofrece Renovar y abre el pago sin pedir datos", async () => {
    const plan = await prisma.package.findFirstOrThrow({ where: { clientId: owner.id, nombre: "Básico", visiblePublico: true }, select: { id: true } });
    const visitor = new Browser();
    const bought = await visitor.json(`/api/public/studios/${slug}/plans`, "POST", {
      packageId: plan.id,
      celular: "3115550388",
      nombre: "Gina",
      pago: { tipo: "COMPROBANTE", comprobante: PHOTO, metodo: "Nequi" }
    });
    assert.equal(bought.status, 201, JSON.stringify(bought.body));
    const token = bought.body.data.accessToken as string;
    const today = studioNow().dateKey;
    await prisma.memberPackage.update({
      where: { accessToken: token },
      data: { inicio: new Date(`${addDaysToKey(today, -40)}T00:00:00Z`), vence: new Date(`${addDaysToKey(today, -11)}T00:00:00Z`) }
    });

    const mine = visibleText((await visitor.page(`/s/${slug}/plan/${token}`)).html);
    assert.ok(mine.includes("Renovar plan"), "Mi plan: falta Renovar plan");

    const renew = await visitor.page(`/s/${slug}/comprar?renueva=${token}`);
    assert.equal(renew.status, 200);
    const text = visibleText(renew.html);
    for (const expected of ["Renueva tu plan", "Renovación para Gina", "Enviar comprobante y renovar"]) assert.ok(text.includes(expected), `renovar: falta "${expected}"`);
    assert.equal(text.includes("Tus datos"), false, "no pide datos");
  });
});

describe("spec 022 · ficha del cliente", () => {
  const PHOTO = `data:image/png;base64,iVBORw0KGgo${"A".repeat(400)}`;
  let browser: Browser;

  before(async () => {
    browser = new Browser();
    await browser.login(owner.email, PASSWORD);
  });

  test("un pago anulado dice Anulado y no cuenta en Pagos", async () => {
    const plan = await prisma.package.findFirstOrThrow({ where: { clientId: owner.id, nombre: "Básico", clases: 4 }, select: { id: true } });
    const member = await createMember(owner.token, "Nora");
    const sale = await sell(owner.token, member.id, plan.id, { pago: { monto: 55000, metodoPago: "NEQUI" } });
    const payment = await prisma.memberPackagePayment.findFirstOrThrow({ where: { memberPackageId: sale.id } });
    expectOk(await call(paymentRoute.DELETE, { token: owner.token, method: "DELETE", params: { id: sale.id, paymentId: payment.id } }));

    const text = visibleText((await browser.page(`/dashboard/clientes/${member.id}`)).html);
    for (const expected of ["Pagos (0)", "1 pago anulado no cuenta", "Anulado", "Registrar pago"]) {
      assert.ok(text.includes(expected), `ficha: falta "${expected}"`);
    }
  });

  test("spec 027 D6: el comprobante por revisar va arriba de los pagos del plan, sin pestañas", async () => {
    const plan = await prisma.package.findFirstOrThrow({ where: { clientId: owner.id, nombre: "Básico", visiblePublico: true }, select: { id: true } });
    const bought = await new Browser().json(`/api/public/studios/${slug}/plans`, "POST", {
      packageId: plan.id,
      celular: "3115550499",
      nombre: "Olivia",
      pago: { tipo: "COMPROBANTE", comprobante: PHOTO, metodo: "Nequi" }
    });
    assert.equal(bought.status, 201, JSON.stringify(bought.body));
    const member = await prisma.studioMember.findFirstOrThrow({ where: { clientId: owner.id, celular: "3115550499" }, select: { id: true } });

    const { html } = await browser.page(`/dashboard/clientes/${member.id}`);
    assert.doesNotMatch(html, /aria-label="Detalle del plan"/, "el plan ya no tiene pestañas");
    const text = visibleText(html);
    for (const expected of ["Revisar comprobante", "Pagos (0)", "Comprobante · Nequi", "Por revisar", "Aprobar $", "Rechazar", "Compró en línea", "Pago en revisión"]) {
      assert.ok(text.includes(expected), `ficha: falta "${expected}"`);
    }
  });

  test("con dos planes muestra el selector y un plan a la vez", async () => {
    const plans = await prisma.package.findMany({ where: { clientId: owner.id, nombre: "Básico", clases: 4 }, select: { id: true } });
    const member = await createMember(owner.token, "Dalia");
    await sell(owner.token, member.id, plans[0].id, { pago: { monto: 55000, metodoPago: "NEQUI" } });
    await sell(owner.token, member.id, plans[1].id);

    const { html } = await browser.page(`/dashboard/clientes/${member.id}`);
    const text = visibleText(html);
    assert.ok(text.includes("Planes actuales (2)"), "falta el título con los dos planes");
    assert.match(html, /aria-label="Planes del cliente"/, "falta el selector de planes");
    assert.equal((html.match(/Más acciones del plan/g) ?? []).length, 1, "se ve un plan a la vez");
  });
});

describe("spec 023 · instructores y pagos a instructores", () => {
  let browser: Browser;

  before(async () => {
    browser = new Browser();
    await browser.login(owner.email, PASSWORD);
  });

  test("instructores, titular en el horario y Pagos que primero invita a configurar", async () => {
    const discipline = await prisma.discipline.findFirstOrThrow({ where: { clientId: owner.id, nombre: "Body Combat" }, select: { id: true } });
    expectOk(
      await call(instructorsRoute.POST, {
        token: owner.token,
        method: "POST",
        body: { nombre: "Valeria", apellido: "Toro", variable: "ALUMNO_FIJO", valor: 6000, disciplinas: [{ disciplineId: discipline.id }] }
      }),
      201
    );

    // Spec 024 R8: la dirección vieja lleva a Colaboradores.
    const old = await browser.page("/dashboard/instructores");
    assert.match(old.location ?? "", /\/dashboard\/colaboradores$/);
    const team = visibleText((await browser.page("/dashboard/colaboradores")).html);
    for (const expected of ["Colaboradores", "Agregar colaborador", "Instructores", "Administradores", "Socios", "Valeria Toro", "$6.000 por alumno", "EQUIPO", "Pagos"]) {
      assert.ok(team.includes(expected), `instructores: falta "${expected}"`);
    }

    const invite = visibleText((await browser.page("/dashboard/colaboradores/pagos")).html);
    for (const expected of ["Pagos a instructores", "Configura tu ciclo de pago", "No se genera deuda de antes"]) {
      assert.ok(invite.includes(expected), `pagos sin configurar: falta "${expected}"`);
    }

    expectOk(
      await call(paySettingsRoute.PUT, {
        token: owner.token,
        method: "PUT",
        body: { frecuencia: "SEMANAL", diaPago: 7, frecuenciaSueldo: "MENSUAL", diaPagoSueldo: 15 }
      })
    );
    const ledger = visibleText((await browser.page("/dashboard/colaboradores/pagos")).html);
    for (const expected of ["Total pendiente de pago", "Comisiones:", "Semanal, los domingos", "Configurar ciclo de pago", "Pendientes", "Historial"]) {
      assert.ok(ledger.includes(expected), `pagos: falta "${expected}"`);
    }
    // Nadie del equipo tiene sueldo: ese calendario no aparece.
    assert.equal(ledger.includes("Sueldos:"), false);
  });
});

describe("spec 024 · un administrador entra y ve solo su menú", () => {
  test("login con su correo, menú según permisos, sin plan y sin acceso a lo demás", async () => {
    const adminEmail = `admin-${Date.now()}@equipo.test`;
    expectOk(
      await call(collaboratorsRoute.POST, {
        token: owner.token,
        method: "POST",
        path: "/api/collaborators",
        body: { nombre: "Camila Admin", email: adminEmail, password: "Secreta123", rol: "ADMIN", permisos: { HORARIO: true, VER_PAGOS: true } }
      }),
      201
    );
    const camila = new Browser();
    await camila.login(adminEmail, "Secreta123");

    const home = visibleText((await camila.page("/dashboard/horario")).html);
    for (const expected of ["Horario de clases", "Camila Admin", "Administrador", "Pagos"]) {
      assert.ok(home.includes(expected), `horario: falta "${expected}"`);
    }
    for (const hidden of ["Clientes", "Contabilidad", "Mi Plan", "Colaboradores"]) {
      assert.equal(home.includes(hidden), false, `no debería ver "${hidden}"`);
    }
    const blocked = visibleText((await camila.page("/dashboard/contabilidad")).html);
    assert.ok(blocked.includes("No tienes acceso a esta sección"));
  });
});
