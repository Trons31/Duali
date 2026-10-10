import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { classUsage, expiredWithoutRenewal, paymentDeadline, renewalStart, serializeMemberPackage } from "@/lib/member-packages";
import { normalizeMemberPhone } from "@/lib/studio-constants";

type Row = Parameters<typeof serializeMemberPackage>[0];

function sale(overrides: Partial<Row> = {}): Row {
  return {
    id: "venta",
    clientId: "negocio",
    memberId: "cliente",
    packageId: "paquete",
    disciplineId: "disciplina",
    nombre: "Básico",
    clases: 4,
    clasesUsadas: 0,
    precio: 55000 as never,
    pagado: 30000 as never,
    inicio: new Date("2026-10-01T00:00:00Z"),
    vence: new Date("2026-10-30T00:00:00Z"),
    anuladoAt: null,
    motivoAnulacion: null,
    notas: null,
    createdAt: new Date("2026-10-01T15:00:00Z"),
    updatedAt: new Date("2026-10-01T15:00:00Z"),
    discipline: { id: "disciplina", nombre: "Body Combat", color: "#f43f5e", tipo: "CLASE" },
    origen: "PANEL",
    accessToken: null,
    fechaLimitePago: null,
    renovacionDeId: null,
    payments: [],
    bookings: [],
    receipts: [],
    client: { diasPlazoSaldo: 7 },
    renovacionDe: null,
    renovaciones: [],
    ...overrides
  };
}

describe("estado calculado de una venta (spec 006)", () => {
  test("vigente con pago parcial deja saldo", () => {
    const view = serializeMemberPackage(sale(), "2026-10-09");
    assert.equal(view.estado, "ACTIVO");
    assert.equal(view.estadoPago, "PARCIAL");
    assert.equal(view.saldo, 25000);
    assert.equal(view.clasesRestantes, 4);
    assert.equal(view.porVencer, false);
  });

  test("vence sin proceso nocturno: el día después del vencimiento ya es Vencido", () => {
    assert.equal(serializeMemberPackage(sale(), "2026-10-30").estado, "ACTIVO");
    assert.equal(serializeMemberPackage(sale(), "2026-10-31").estado, "VENCIDO");
  });

  test("avisa por vencer en los últimos 3 días", () => {
    assert.equal(serializeMemberPackage(sale(), "2026-10-26").porVencer, false);
    const view = serializeMemberPackage(sale(), "2026-10-27");
    assert.equal(view.porVencer, true);
    assert.equal(view.diasParaVencer, 3);
  });

  test("agotado cuando usó todas las clases", () => {
    const view = serializeMemberPackage(sale({ clasesUsadas: 4 }), "2026-10-09");
    assert.equal(view.estado, "AGOTADO");
    assert.equal(view.clasesRestantes, 0);
  });

  test("avisa pocas clases con 2 o menos, pero no en la clase suelta", () => {
    assert.equal(serializeMemberPackage(sale({ clasesUsadas: 2 }), "2026-10-09").pocasClases, true);
    assert.equal(serializeMemberPackage(sale({ clasesUsadas: 1 }), "2026-10-09").pocasClases, false);
    assert.equal(serializeMemberPackage(sale({ clases: 1 }), "2026-10-09").pocasClases, false);
  });

  test("anulada: no tiene saldo aunque no se haya pagado", () => {
    const view = serializeMemberPackage(sale({ anuladoAt: new Date() }), "2026-10-09");
    assert.equal(view.estado, "ANULADO");
    assert.equal(view.saldo, 0);
  });

  test("pagada por completo", () => {
    const view = serializeMemberPackage(sale({ pagado: 55000 as never }), "2026-10-09");
    assert.equal(view.estadoPago, "PAGADO");
    assert.equal(view.saldo, 0);
  });

  test("anulado tiene prioridad sobre vencido y agotado", () => {
    assert.equal(serializeMemberPackage(sale({ anuladoAt: new Date(), clasesUsadas: 4 }), "2026-12-01").estado, "ANULADO");
  });
});

describe("celular de clientes del estudio", () => {
  test("quita el 57 y los símbolos", () => {
    assert.equal(normalizeMemberPhone("+57 300 123 4567"), "3001234567");
    assert.equal(normalizeMemberPhone("300-123-4567"), "3001234567");
    assert.equal(normalizeMemberPhone("573001234567"), "3001234567");
  });

  test("no corta números que no son de Colombia ni los cortos", () => {
    assert.equal(normalizeMemberPhone("+1 305 555 0101"), "13055550101");
    assert.equal(normalizeMemberPhone("5712345"), "5712345");
  });
});

describe("barra de clases y clase suelta (spec 019 R8, D2)", () => {
  const session = { fecha: new Date("2026-10-13T00:00:00Z"), horaInicio: "18:00", schedule: { discipline: { nombre: "Body Combat" } } };

  test("desglose: las devueltas no cuentan y cancelar fuera de plazo es una falta", () => {
    const usage = classUsage([
      { estado: "ASISTIO", claseDevuelta: false },
      { estado: "ASISTIO", claseDevuelta: false },
      { estado: "NO_ASISTIO", claseDevuelta: false },
      { estado: "NO_ASISTIO", claseDevuelta: true },
      { estado: "CANCELADA", claseDevuelta: true },
      { estado: "CANCELADA", claseDevuelta: false },
      { estado: "RESERVADA", claseDevuelta: false }
    ]);
    assert.deepEqual(usage, { asistio: 2, falto: 2, reservadas: 1 });
  });

  test("asistió + faltó + reservadas + disponibles = clases del plan", () => {
    const bookings = [
      { estado: "ASISTIO" as const, claseDevuelta: false, session },
      { estado: "NO_ASISTIO" as const, claseDevuelta: false, session },
      { estado: "NO_ASISTIO" as const, claseDevuelta: true, session },
      { estado: "RESERVADA" as const, claseDevuelta: false, session }
    ];
    const item = serializeMemberPackage(sale({ clases: 8, clasesUsadas: 3, bookings }), "2026-10-05");
    assert.equal(item.uso.asistio + item.uso.falto + item.uso.reservadas + item.clasesRestantes, item.clases);
    assert.equal(item.claseSuelta, false);
  });

  test("una venta de 1 clase es clase suelta y dice para qué clase es", () => {
    const item = serializeMemberPackage(
      sale({ clases: 1, clasesUsadas: 1, bookings: [{ estado: "RESERVADA", claseDevuelta: false, session }] }),
      "2026-10-05"
    );
    assert.equal(item.claseSuelta, true);
    assert.equal(item.clase?.fecha, "2026-10-13");
    assert.equal(item.clase?.horaInicio, "18:00");
    assert.equal(serializeMemberPackage(sale({ clases: 1 }), "2026-10-05").clase, null);
  });
});

describe("fecha límite del saldo y renovación (spec 020)", () => {
  // La venta base: empieza el 1 oct, vence el 30 oct, debe 25.000.
  test("sin fecha guardada, el saldo vence a los días del plazo; con fecha, en esa", () => {
    assert.equal(paymentDeadline({ fechaLimitePago: null, inicio: new Date("2026-10-01T00:00:00Z") }, 7), "2026-10-08");
    assert.equal(
      paymentDeadline({ fechaLimitePago: new Date("2026-10-20T00:00:00Z"), inicio: new Date("2026-10-01T00:00:00Z") }, 7),
      "2026-10-20"
    );
  });

  test("el saldo está vencido desde el día después de la fecha límite, con sus días de atraso", () => {
    assert.equal(serializeMemberPackage(sale(), "2026-10-08").saldoVencido, false);
    const late = serializeMemberPackage(sale(), "2026-10-11");
    assert.equal(late.saldoVencido, true);
    assert.equal(late.diasAtrasoSaldo, 3);
    assert.equal(serializeMemberPackage(sale({ client: { diasPlazoSaldo: 15 } }), "2026-10-11").saldoVencido, false);
    assert.equal(serializeMemberPackage(sale({ pagado: 55000 as never }), "2026-10-20").saldoVencido, false);
  });

  test("un pago en revisión no está atrasado; uno rechazado sí", () => {
    const review = sale({ origen: "PUBLICO", receipts: [{ estado: "POR_REVISAR", createdAt: new Date("2026-10-02T12:00:00Z") }] });
    assert.equal(serializeMemberPackage(review, "2026-10-20").saldoVencido, false);
    const rejected = sale({ origen: "PUBLICO", receipts: [{ estado: "RECHAZADO", createdAt: new Date("2026-10-02T12:00:00Z") }] });
    assert.equal(serializeMemberPackage(rejected, "2026-10-20").saldoVencido, true);
  });

  test("días vencido y cuándo se puede renovar", () => {
    const expired = serializeMemberPackage(sale(), "2026-11-04");
    assert.equal(expired.estado, "VENCIDO");
    assert.equal(expired.diasVencido, 5);
    assert.equal(expired.puedeRenovar, true);
    assert.equal(serializeMemberPackage(sale(), "2026-10-09").puedeRenovar, false, "vigente y lejos de vencer");
    assert.equal(serializeMemberPackage(sale(), "2026-10-28").puedeRenovar, true, "por vencer");
    assert.equal(serializeMemberPackage(sale({ clasesUsadas: 4 }), "2026-10-09").puedeRenovar, true, "agotado");
    assert.equal(serializeMemberPackage(sale({ clases: 1 }), "2026-11-04").puedeRenovar, false, "clase suelta");
    const renewed = sale({
      renovaciones: [{ id: "nueva", nombre: "Básico", inicio: new Date("2026-10-31T00:00:00Z"), vence: new Date("2026-11-29T00:00:00Z") }]
    });
    const view = serializeMemberPackage(renewed, "2026-11-04");
    assert.equal(view.puedeRenovar, false);
    assert.deepEqual(view.renovadoPor, { id: "nueva", nombre: "Básico", inicio: "2026-10-31", vence: "2026-11-29" });
  });

  test("renovar: vigente sigue al día siguiente de vencer; vencido o agotado, hoy", () => {
    assert.equal(renewalStart({ estado: "ACTIVO", vence: "2026-10-30" }, "2026-10-28"), "2026-10-31");
    assert.equal(renewalStart({ estado: "VENCIDO", vence: "2026-10-30" }, "2026-11-04"), "2026-11-04");
    assert.equal(renewalStart({ estado: "AGOTADO", vence: "2026-10-30" }, "2026-10-20"), "2026-10-20");
  });

  test("vencidos sin renovar: sin otro plan vigente, dentro de 60 días, uno por disciplina", () => {
    const today = "2026-11-10";
    const view = (overrides: Partial<Row>) => ({ ...serializeMemberPackage(sale(overrides), today), discipline: { id: overrides.disciplineId ?? "disciplina", nombre: "", color: "", tipo: "CLASE" as const } });
    const ida = view({ id: "ida", memberId: "ida", vence: new Date("2026-11-05T00:00:00Z") });
    const idaOlder = view({ id: "ida-vieja", memberId: "ida", vence: new Date("2026-10-01T00:00:00Z") });
    const eva = view({ id: "eva", memberId: "eva", vence: new Date("2026-11-08T00:00:00Z") });
    const evaActive = view({ id: "eva-nueva", memberId: "eva", disciplineId: "otra", vence: new Date("2026-12-01T00:00:00Z") });
    const old = view({ id: "olga", memberId: "olga", vence: new Date("2026-08-01T00:00:00Z") });
    const bea = view({ id: "bea", memberId: "bea", vence: new Date("2026-11-09T00:00:00Z") });

    const result = expiredWithoutRenewal([ida, idaOlder, eva, evaActive, old, bea]);
    assert.deepEqual(result.map((item) => item.id), ["bea", "ida"]);
    assert.deepEqual(expiredWithoutRenewal([ida, bea], 3).map((item) => item.id), ["bea"]);
  });
});
