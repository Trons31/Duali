import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { attendanceValue, classEarning, describePay, payExample, payKind, type InstructorPay } from "@/lib/instructor-pay";

const pay = (overrides: Partial<InstructorPay>): InstructorPay => ({
  sueldo: null,
  variable: null,
  valor: null,
  minimoPorClase: null,
  alumnosMinimos: 1,
  ...overrides
});

describe("formas de pago de instructores (spec 023 D1)", () => {
  test("por alumno con mínimo: 8 alumnos a $6.000 = $48.000; 3 alumnos sube al mínimo de $30.000", () => {
    const laura = pay({ variable: "ALUMNO_FIJO", valor: 6000, minimoPorClase: 30000 });
    assert.deepEqual(classEarning(laura, { alumnos: 8, valorClases: 0 }), { ganado: 48000, regla: "VARIABLE", valorAplicado: 6000 });
    assert.deepEqual(classEarning(laura, { alumnos: 3, valorClases: 0 }), { ganado: 30000, regla: "MINIMO", valorAplicado: 6000 });
  });

  test("por alumno 40 %: dos planes de $160.000/8 y una clase suelta de $25.000 = $26.000", () => {
    const valorClases = attendanceValue({ precio: 160000, clases: 8 }) * 2 + attendanceValue({ precio: 25000, clases: 1 });
    assert.equal(valorClases, 65000);
    const result = classEarning(pay({ variable: "ALUMNO_PORCENTAJE", valor: 40 }), { alumnos: 3, valorClases });
    assert.equal(result.ganado, 26000);
  });

  test("por clase dictada: valor fijo; sin alumnos solo con 'pagar clases aunque no llegue nadie'", () => {
    const andres = pay({ variable: "POR_CLASE", valor: 35000 });
    assert.equal(classEarning(andres, { alumnos: 1, valorClases: 0 }).ganado, 35000);
    assert.equal(classEarning(andres, { alumnos: 0, valorClases: 0 }).regla, "POCOS_ALUMNOS");
    assert.equal(classEarning(andres, { alumnos: 0, valorClases: 0, pagarClasesVacias: true }).ganado, 35000);
  });

  test("desde N alumnos: por debajo no paga ni el mínimo", () => {
    const strict = pay({ variable: "ALUMNO_FIJO", valor: 6000, minimoPorClase: 30000, alumnosMinimos: 4 });
    assert.deepEqual(classEarning(strict, { alumnos: 3, valorClases: 0 }), { ganado: 0, regla: "POCOS_ALUMNOS", valorAplicado: 6000 });
    assert.equal(classEarning(strict, { alumnos: 4, valorClases: 0 }).ganado, 30000);
  });

  test("valor por disciplina reemplaza al general (D4)", () => {
    const mixed = pay({ variable: "POR_CLASE", valor: 30000, valoresDisciplina: { pilates: 45000, rumba: null } });
    assert.equal(classEarning(mixed, { disciplineId: "pilates", alumnos: 5, valorClases: 0 }).ganado, 45000);
    assert.equal(classEarning(mixed, { disciplineId: "rumba", alumnos: 5, valorClases: 0 }).ganado, 30000);
  });

  test("sueldo fijo no genera variable por clase; sueldo + variable sí", () => {
    assert.equal(classEarning(pay({ sueldo: 1200000 }), { alumnos: 10, valorClases: 0 }).regla, "SIN_VARIABLE");
    assert.equal(payKind(pay({ sueldo: 1200000 })), "SUELDO");
    assert.equal(payKind(pay({ sueldo: 600000, variable: "ALUMNO_PORCENTAJE", valor: 30 })), "SUELDO_VARIABLE");
    assert.equal(payKind(pay({ variable: "ALUMNO_FIJO", valor: 1 })), "POR_ALUMNO");
  });

  test("clase de cortesía ($0) no aporta al porcentaje y redondea al peso", () => {
    assert.equal(attendanceValue({ precio: 0, clases: 4 }), 0);
    assert.equal(classEarning(pay({ variable: "ALUMNO_PORCENTAJE", valor: 33 }), { alumnos: 1, valorClases: 20000 }).ganado, 6600);
    assert.equal(classEarning(pay({ variable: "ALUMNO_PORCENTAJE", valor: 33.3 }), { alumnos: 1, valorClases: 10001 }).ganado, 3330);
  });
});

describe("textos de la forma de pago (spec 023 R2)", () => {
  test("una línea para tarjetas", () => {
    assert.equal(describePay(pay({ variable: "ALUMNO_FIJO", valor: 6000, minimoPorClase: 30000 })), "$6.000 por alumno · mín. $30.000 por clase");
    assert.equal(describePay(pay({ sueldo: 1200000 })), "Sueldo fijo · $1.200.000");
    assert.equal(describePay(pay({ sueldo: 600000, variable: "ALUMNO_PORCENTAJE", valor: 30, alumnosMinimos: 3 })), "Sueldo $600.000 + 30 % por alumno · desde 3 alumnos");
  });

  test("el ejemplo en vivo explica el mínimo", () => {
    const lines = payExample(pay({ variable: "ALUMNO_FIJO", valor: 6000, minimoPorClase: 30000 }));
    assert.deepEqual(lines, ["Una clase con 8 alumnos le deja $48.000.", "Una clase con 3 alumnos le deja $30.000 (el mínimo)."]);
  });
});
