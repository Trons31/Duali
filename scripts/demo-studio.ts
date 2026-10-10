/**
 * Estudio demo (spec 016 R3) sobre el usuario demo. Aditivo e idempotente: cada
 * paso solo crea lo que falta, asi que correrlo dos veces no duplica nada. Las
 * ventas y reservas pasan por las mismas funciones que usa la app.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createBooking } from "@/lib/bookings";
import { listClassSessions } from "@/lib/class-sessions";
import { sellMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { addDaysToKey, studioNow, timeKeyToMinutes } from "@/lib/studio-time";
import { COMBO, ensureStudioCatalog } from "./studio-catalog-data";

export const DEMO_EMAIL = "demo@gmail.com";
export const DEMO_SLUG = "studiodance-demo";

const SCHEDULE = [
  { disciplina: "Jump Power", dias: [1, 3, 5], horaInicio: "07:00", cupo: 12 },
  { disciplina: "Body Combat", dias: [1, 3, 5], horaInicio: "18:00", cupo: 15 },
  { disciplina: "Jump Power", dias: [2, 4], horaInicio: "18:00", cupo: 12 },
  { disciplina: "Rumba Fit", dias: [2, 4], horaInicio: "19:00", cupo: 20 },
  { disciplina: "Rumba Fit", dias: [6], horaInicio: "09:00", cupo: 20 }
];

// pagado: "total", un monto parcial o 0 (queda debiendo).
const MEMBERS: Array<{
  nombre: string;
  apellido: string;
  celular: string;
  plan?: { disciplina: string; paquete: string; pagado: "total" | number };
}> = [
  { nombre: "Laura", apellido: "Gómez", celular: "3000000101", plan: { disciplina: "Body Combat", paquete: "Básico", pagado: "total" } },
  { nombre: "Valentina", apellido: "Ruiz", celular: "3000000102", plan: { disciplina: "Mix Studio", paquete: "Plus", pagado: 60_000 } },
  { nombre: "Camila", apellido: "Torres", celular: "3000000103", plan: { disciplina: "Rumba Fit", paquete: "Individual", pagado: 0 } },
  { nombre: "Daniela", apellido: "Rojas", celular: "3000000104", plan: { disciplina: "Jump Power", paquete: "Premium", pagado: "total" } },
  { nombre: "Sofía", apellido: "Martínez", celular: "3000000105", plan: { disciplina: "Mix Studio", paquete: "Full Studiodance", pagado: "total" } },
  { nombre: "Andrea", apellido: "López", celular: "3000000106" }
];

const BOOKINGS_PER_MEMBER = 2;

export async function seedDemoStudio(options: { apply: boolean; email?: string; instant?: Date; log?: (line: string) => void }) {
  const log = options.log ?? console.log;
  const { apply } = options;
  const email = (options.email ?? DEMO_EMAIL).toLowerCase();
  const now = studioNow(options.instant);
  log(`${apply ? "APLICANDO" : "SIMULACION (usa --apply para escribir)"} · estudio demo (${email})`);

  // 1. El usuario demo que ya existe: nunca se crea otro.
  const client = await prisma.client.findFirst({ where: { email, deletedAt: null } });
  if (!client) throw new Error(`No existe un usuario activo con el correo ${email}`);

  const updates: Record<string, unknown> = {};
  if (!client.moduloEstudio) updates.moduloEstudio = true;
  if (!Array.isArray(client.paymentMethodItems) || client.paymentMethodItems.length === 0) {
    updates.paymentMethodItems = [{ name: "Nequi", account: client.telefono ?? "3001234567" }];
  }
  if (!client.slug) {
    const taken = await prisma.client.findFirst({ where: { slug: DEMO_SLUG }, select: { id: true } });
    if (taken) log(`  ! la dirección /s/${DEMO_SLUG} ya es de otro negocio; la página queda sin publicar`);
    else Object.assign(updates, { slug: DEMO_SLUG, paginaPublicaActiva: true });
  }
  for (const key of Object.keys(updates)) log(`  + ${key}`);
  if (apply && Object.keys(updates).length) await prisma.client.update({ where: { id: client.id }, data: updates });
  const clientId = client.id;

  // 2. Catalogo de las historias de Instagram.
  // Cliente de Prisma sin extensiones (el tipo que espera el catalogo), misma base.
  const catalogDb = new PrismaClient();
  const ids = await ensureStudioCatalog(catalogDb, clientId, { apply, log, ajustarPrecios: true }).finally(() => catalogDb.$disconnect());
  const disciplineId = (nombre: string) => ids.get(nombre.toLocaleLowerCase("es"))!;

  // 3. Horario semanal: solo para las disciplinas que aun no tienen clases.
  const scheduled = new Set(
    (await prisma.classSchedule.findMany({ where: { clientId, deletedAt: null }, select: { disciplineId: true } })).map((row) => row.disciplineId)
  );
  for (const row of SCHEDULE) {
    if (scheduled.has(disciplineId(row.disciplina))) {
      log(`  = ${row.disciplina} ya tiene horario`);
      continue;
    }
    log(`  + horario ${row.disciplina} · días ${row.dias.join(",")} · ${row.horaInicio}`);
    if (!apply) continue;
    for (const diaSemana of row.dias) {
      await prisma.classSchedule.create({
        data: { clientId, disciplineId: disciplineId(row.disciplina), diaSemana, horaInicio: row.horaInicio, duracionMin: 60, cupo: row.cupo }
      });
    }
  }
  // Las filas de una misma disciplina se crean juntas en esta corrida; la siguiente ya las encuentra.

  // 4. Clientes y sus planes (uno por cliente, solo si no tiene ninguno).
  const sales: Array<{ memberId: string; saleId: string; disciplina: string; origen: "PANEL" | "PUBLICO" }> = [];
  for (const [index, item] of MEMBERS.entries()) {
    let member = await prisma.studioMember.findUnique({ where: { clientId_celular: { clientId, celular: item.celular } } });
    if (!member) {
      log(`  + cliente ${item.nombre} ${item.apellido}`);
      if (apply) member = await prisma.studioMember.create({ data: { clientId, nombre: item.nombre, apellido: item.apellido, celular: item.celular } });
    }
    if (!item.plan) continue;
    const origen = index % 2 ? ("PANEL" as const) : ("PUBLICO" as const);
    const existingSale = member ? await prisma.memberPackage.findFirst({ where: { memberId: member.id }, select: { id: true } }) : null;
    if (existingSale) {
      sales.push({ memberId: member!.id, saleId: existingSale.id, disciplina: item.plan.disciplina, origen });
      continue;
    }

    const { plan } = item;
    log(`  + venta ${plan.paquete} ${plan.disciplina} a ${item.nombre}${plan.pagado === 0 ? " (debe todo)" : plan.pagado === "total" ? "" : " (abono)"}`);
    if (!apply || !member) continue;
    const pkg = await prisma.package.findFirstOrThrow({
      where: { clientId, disciplineId: disciplineId(plan.disciplina), nombre: plan.paquete, deletedAt: null }
    });
    const monto = plan.pagado === "total" ? Number(pkg.precio) : plan.pagado;
    const memberId = member.id;
    const sale = await prisma.$transaction((tx) =>
      sellMemberPackage(tx, {
        clientId,
        memberId,
        packageId: pkg.id,
        inicio: now.dateKey,
        ...(monto > 0 ? { pago: { monto, metodoPago: index % 2 ? "EFECTIVO" : "NEQUI" } } : {})
      })
    );
    sales.push({ memberId, saleId: sale.id, disciplina: plan.disciplina, origen });
  }

  // 5. Reservas de los proximos dias para los clientes del demo que aun no tienen ninguna.
  if (!apply) return log("  + reservas de los próximos días (se calculan al aplicar)");
  const upcoming = (await listClassSessions(clientId, now.dateKey, addDaysToKey(now.dateKey, 6))).filter(
    (session) => !session.cancelada && (session.fecha > now.dateKey || timeKeyToMinutes(session.horaInicio) > now.minutes)
  );
  let booked = 0;
  let failed = 0;
  for (const sale of sales) {
    if (await prisma.booking.count({ where: { memberId: sale.memberId } })) continue;
    const allowed = sale.disciplina === COMBO.nombre ? COMBO.incluye : [sale.disciplina];
    const options = upcoming.filter((session) => allowed.includes(session.discipline.nombre)).slice(0, BOOKINGS_PER_MEMBER);
    for (const session of options) {
      try {
        await createBooking({
          clientId,
          scheduleId: session.scheduleId,
          fecha: session.fecha,
          memberId: sale.memberId,
          memberPackageId: sale.saleId,
          origen: sale.origen,
          ...(sale.origen === "PUBLICO" ? { accessToken: randomBytes(24).toString("base64url") } : {})
        });
        booked += 1;
      } catch (error) {
        // La clase suelta solo alcanza para una reserva; cualquier otro motivo se informa.
        if (!(error instanceof Error && /clases disponibles|no sirve/.test(error.message))) {
          failed += 1;
          log(`  ! no se pudo reservar ${session.discipline.nombre} ${session.fecha}: ${error instanceof Error ? error.message : error}`);
        }
        break;
      }
    }
  }
  if (booked) log(`  + ${booked} reservas en los próximos días`);
  if (failed) log(`  ! ${failed} reserva(s) fallaron; corrige el motivo y vuelve a correr el seed`);
  if (!booked && !failed) log("  = las reservas ya existen");
}
