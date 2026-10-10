// Datos de apoyo para las pruebas del Modo Estudio. Todo pasa por la API real.
import * as disciplinesRoute from "@/app/api/disciplines/route";
import * as packagesRoute from "@/app/api/packages/route";
import * as schedulesRoute from "@/app/api/class-schedules/route";
import * as membersRoute from "@/app/api/studio-members/route";
import * as salesRoute from "@/app/api/member-packages/route";
import { addDaysToKey, isoWeekday, studioTodayKey } from "@/lib/studio-time";
import { call, expectOk } from "./helpers";

export type Catalog = Awaited<ReturnType<typeof createCatalog>>;

/** Body Combat, Rumba Fit, Jump Power, el combo Mix Studio y un par de paquetes por disciplina. */
export async function createCatalog(token: string) {
  const discipline = async (nombre: string, color: string) =>
    expectOk<{ id: string }>(
      await call(disciplinesRoute.POST, { token, method: "POST", body: { nombre, color } }),
      201
    );

  const bodyCombat = await discipline("Body Combat", "#f43f5e");
  const rumba = await discipline("Rumba Fit", "#f97316");
  const jump = await discipline("Jump Power", "#0ea5e9");
  const mix = expectOk<{ id: string }>(
    await call(disciplinesRoute.POST, {
      token,
      method: "POST",
      body: { tipo: "COMBO", nombre: "Mix Studio", color: "#a855f7", incluyeIds: [bodyCombat.id, rumba.id, jump.id] }
    }),
    201
  );

  const packages = async (nombre: string, clases: number, precio: number, disciplineIds: string[]) =>
    expectOk<Array<{ id: string; disciplineId: string }>>(
      await call(packagesRoute.POST, { token, method: "POST", body: { nombre, clases, precio, disciplineIds } }),
      201
    );

  const individual = await packages("Individual", 1, 15000, [bodyCombat.id, rumba.id]);
  const basico = await packages("Básico", 4, 55000, [bodyCombat.id, rumba.id]);
  const [jumpBasico] = await packages("Básico", 4, 65000, [jump.id]);
  const [mixBasico] = await packages("Básico", 4, 60000, [mix.id]);
  const byDiscipline = (list: Array<{ id: string; disciplineId: string }>, id: string) =>
    list.find((item) => item.disciplineId === id)!.id;

  return {
    disciplines: { bodyCombat: bodyCombat.id, rumba: rumba.id, jump: jump.id, mix: mix.id },
    packages: {
      individualBodyCombat: byDiscipline(individual, bodyCombat.id),
      basicoBodyCombat: byDiscipline(basico, bodyCombat.id),
      basicoRumba: byDiscipline(basico, rumba.id),
      basicoJump: jumpBasico.id,
      basicoMix: mixBasico.id
    }
  };
}

let phone = 3_000_000_000;

export async function createMember(token: string, nombre = "Laura") {
  phone += 1;
  return expectOk<{ id: string; celular: string }>(
    await call(membersRoute.POST, { token, method: "POST", body: { nombre, celular: String(phone) } }),
    201
  );
}

export async function sell(
  token: string,
  memberId: string,
  packageId: string,
  extra: Record<string, unknown> = {}
) {
  return expectOk<{ id: string; saldo: number; clasesRestantes: number; vence: string; inicio: string }>(
    await call(salesRoute.POST, { token, method: "POST", body: { memberId, packageId, ...extra } }),
    201
  );
}

/** La proxima fecha (desde pasado mañana) que cae en ese dia de la semana. */
export function nextDate(weekday: number, minDaysAhead = 2) {
  let key = addDaysToKey(studioTodayKey(), minDaysAhead);
  while (isoWeekday(key) !== weekday) key = addDaysToKey(key, 1);
  return key;
}

export async function createSchedule(
  token: string,
  disciplineId: string,
  dias: number[],
  extra: { horaInicio?: string; cupo?: number; duracionMin?: number } = {}
) {
  return expectOk<Array<{ id: string; diaSemana: number }>>(
    await call(schedulesRoute.POST, {
      token,
      method: "POST",
      body: { disciplineId, dias, horaInicio: "18:00", duracionMin: 60, cupo: 15, ...extra }
    }),
    201
  );
}
