import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { paymentMethodFromName, paymentState, receiptDataUrlProblem } from "@/lib/online-payments";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 9, 12, minutes));

describe("estado del pago de una venta (spec 021)", () => {
  test("pagado gana a todo", () => {
    assert.equal(paymentState({ saldo: 0, origen: "PUBLICO", receipts: [{ estado: "POR_REVISAR", createdAt: at(0) }] }), "PAGADO");
  });

  test("con un comprobante por revisar está en revisión, aunque otro se haya rechazado", () => {
    const receipts = [
      { estado: "RECHAZADO" as const, createdAt: at(0) },
      { estado: "POR_REVISAR" as const, createdAt: at(5) }
    ];
    assert.equal(paymentState({ saldo: 1000, origen: "PUBLICO", receipts }), "EN_REVISION");
  });

  test("rechazado solo si el último comprobante se rechazó", () => {
    assert.equal(paymentState({ saldo: 1000, origen: "PUBLICO", receipts: [{ estado: "RECHAZADO", createdAt: at(0) }] }), "RECHAZADO");
    const receipts = [
      { estado: "RECHAZADO" as const, createdAt: at(0) },
      { estado: "APROBADO" as const, createdAt: at(9) }
    ];
    assert.equal(paymentState({ saldo: 1000, origen: "PUBLICO", receipts }), "DEBE", "abono aprobado, falta el resto");
  });

  test("compra en línea sin comprobante paga en el estudio; una del panel solo debe", () => {
    assert.equal(paymentState({ saldo: 1000, origen: "PUBLICO", receipts: [] }), "PAGO_EN_ESTUDIO");
    assert.equal(paymentState({ saldo: 1000, origen: "PANEL", receipts: [] }), "DEBE");
  });
});

describe("foto del comprobante (spec 021 R2)", () => {
  const base64 = (bytes: number) => "A".repeat(Math.ceil((bytes * 4) / 3));

  test("acepta JPG, PNG y WebP", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      assert.equal(receiptDataUrlProblem(`data:${type};base64,${base64(2000)}`), null, type);
    }
  });

  test("rechaza otros tipos, textos y fotos de más de 4 MB", () => {
    assert.match(receiptDataUrlProblem(`data:image/gif;base64,${base64(2000)}`) ?? "", /JPG/);
    assert.match(receiptDataUrlProblem("hola") ?? "", /válida/);
    assert.match(receiptDataUrlProblem(`data:image/jpeg;base64,${base64(4 * 1024 * 1024 + 10)}`) ?? "", /4 MB/);
    assert.match(receiptDataUrlProblem("data:image/jpeg;base64,AAAA") ?? "", /válida/);
  });
});

describe("método al aprobar (spec 021 R11)", () => {
  test("el nombre del método del estudio se lleva al registro de pago", () => {
    assert.equal(paymentMethodFromName("Nequi"), "NEQUI");
    assert.equal(paymentMethodFromName("Bancolombia ahorros"), "BANCOLOMBIA");
    assert.equal(paymentMethodFromName("Daviplata"), "TRANSFERENCIA");
    assert.equal(paymentMethodFromName(null), "TRANSFERENCIA");
  });
});
