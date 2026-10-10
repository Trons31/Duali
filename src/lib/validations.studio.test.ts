import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bookingCreateSchema,
  bookingUpdateSchema,
  classScheduleCreateSchema,
  classScheduleUpdateSchema,
  clientProfileSchema,
  disciplineSchema,
  memberPackageSaleSchema,
  memberPackageUpdateSchema,
  packageCreateSchema,
  packageUpdateSchema,
  studioMemberSchema
} from "@/lib/validations";

describe("validaciones del Modo Estudio", () => {
  test("perfil: módulos y plazo de cancelación (specs 002 y 007)", () => {
    assert.deepEqual(clientProfileSchema.parse({ moduloEstudio: true }), { moduloEstudio: true });
    assert.equal(clientProfileSchema.parse({ horasCancelacion: "4" }).horasCancelacion, 4);
    assert.equal(clientProfileSchema.safeParse({ horasCancelacion: 200 }).success, false);
  });

  test("disciplina: color de la paleta y nombre mínimo", () => {
    assert.equal(disciplineSchema.safeParse({ nombre: "Body Combat", color: "#14b87e" }).success, true);
    assert.equal(disciplineSchema.safeParse({ nombre: "Body Combat", color: "#123456" }).success, false);
    assert.equal(disciplineSchema.safeParse({ nombre: "B", color: "#14b87e" }).success, false);
  });

  test("disciplina: un PUT parcial sin descripción no la borra", () => {
    const parsed = disciplineSchema.partial().parse({ nombre: "Rumba Fit" });
    assert.equal("descripcion" in parsed && parsed.descripcion !== undefined, false);
    assert.equal(disciplineSchema.partial().parse({ descripcion: "" }).descripcion, null);
  });

  test("paquete: al menos una disciplina y 1 clase", () => {
    const ok = packageCreateSchema.parse({ nombre: "Básico", clases: "4", precio: "55000", disciplineIds: ["a", "b"] });
    assert.equal(ok.clases, 4);
    assert.equal(ok.vigenciaDias, 30);
    assert.equal(packageCreateSchema.safeParse({ nombre: "Básico", clases: 0, precio: 1, disciplineIds: ["a"] }).success, false);
    assert.equal(packageCreateSchema.safeParse({ nombre: "Básico", clases: 4, precio: 1, disciplineIds: [] }).success, false);
  });

  test("paquete: el PUT parcial no impone valores por defecto", () => {
    assert.deepEqual(packageUpdateSchema.parse({ precio: 65000 }), { precio: 65000 });
  });

  test("horario: hora válida, duración y días", () => {
    const base = { disciplineId: "d", horaInicio: "18:00", duracionMin: 60, cupo: 15, dias: [1, 3, 5] };
    assert.equal(classScheduleCreateSchema.safeParse(base).success, true);
    assert.equal(classScheduleCreateSchema.safeParse({ ...base, horaInicio: "25:00" }).success, false);
    assert.equal(classScheduleCreateSchema.safeParse({ ...base, duracionMin: 10 }).success, false);
    assert.equal(classScheduleCreateSchema.safeParse({ ...base, dias: [] }).success, false);
    assert.equal(classScheduleCreateSchema.safeParse({ ...base, dias: [8] }).success, false);
    assert.equal(classScheduleUpdateSchema.safeParse({ diaSemana: 0 }).success, false);
  });

  test("cliente: normaliza el celular y valida correo", () => {
    const parsed = studioMemberSchema.parse({ nombre: "Laura", celular: "+57 300 123 4567", email: "LAURA@Mail.com" });
    assert.equal(parsed.celular, "3001234567");
    assert.equal(parsed.email, "laura@mail.com");
    assert.equal(studioMemberSchema.safeParse({ nombre: "Laura", celular: "123" }).success, false);
    assert.equal(studioMemberSchema.safeParse({ nombre: "Laura", celular: "3001234567", email: "no-es-correo" }).success, false);
  });

  test("venta: pago con método conocido y fecha válida", () => {
    assert.equal(memberPackageSaleSchema.safeParse({ memberId: "m", packageId: "p", pago: { monto: 1000, metodoPago: "NEQUI" } }).success, true);
    assert.equal(memberPackageSaleSchema.safeParse({ memberId: "m", packageId: "p", pago: { monto: 1000, metodoPago: "BANCOLOMBIA" } }).success, true);
    assert.equal(memberPackageSaleSchema.safeParse({ memberId: "m", packageId: "p", pago: { monto: 1000, metodoPago: "BITCOIN" } }).success, false);
    assert.equal(memberPackageSaleSchema.safeParse({ memberId: "m", packageId: "p", inicio: "2026-02-30" }).success, false);
  });

  test("gestionar venta: extender o anular, nada más", () => {
    assert.equal(memberPackageUpdateSchema.safeParse({ vence: "2026-11-15" }).success, true);
    assert.equal(memberPackageUpdateSchema.safeParse({ anular: true }).success, true);
    assert.equal(memberPackageUpdateSchema.safeParse({ anular: false }).success, false);
    assert.equal(memberPackageUpdateSchema.safeParse({ precio: 1 }).success, false);
  });

  test("reserva: cancelar o marcar asistencia", () => {
    assert.equal(bookingCreateSchema.safeParse({ scheduleId: "s", fecha: "2026-10-12", memberId: "m" }).success, true);
    assert.equal(bookingUpdateSchema.safeParse({ cancelar: true, devolverClase: true }).success, true);
    assert.equal(bookingUpdateSchema.safeParse({ estado: "ASISTIO" }).success, true);
    assert.equal(bookingUpdateSchema.safeParse({ estado: "CANCELADA" }).success, false);
  });
});
