import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  allocatePayment,
  balanceParts,
  methodBreakdown,
  paymentPartsError,
  resolvePaymentParts,
  summaryMethod
} from "@/lib/payment-breakdown";

describe("pago en dos partes (spec 027 R2)", () => {
  test("un método por el total es válido", () => {
    assert.equal(paymentPartsError(160000, [{ metodo: "EFECTIVO", monto: 160000 }]), null);
  });

  test("dos partes distintas que suman el total son válidas", () => {
    assert.equal(paymentPartsError(160000, [{ metodo: "EFECTIVO", monto: 100000 }, { metodo: "NEQUI", monto: 60000 }]), null);
  });

  test("rechaza partes que no suman, repetidas, en cero, de más o desconocidas", () => {
    assert.match(paymentPartsError(160000, [{ metodo: "EFECTIVO", monto: 100000 }, { metodo: "NEQUI", monto: 50000 }]) ?? "", /Falta registrar \$10\.000/);
    assert.match(paymentPartsError(160000, [{ metodo: "EFECTIVO", monto: 100000 }, { metodo: "NEQUI", monto: 70000 }]) ?? "", /superan el total/);
    assert.match(paymentPartsError(100, [{ metodo: "NEQUI", monto: 50 }, { metodo: "NEQUI", monto: 50 }]) ?? "", /distintos/);
    assert.match(paymentPartsError(100, [{ metodo: "NEQUI", monto: 0 }, { metodo: "EFECTIVO", monto: 100 }]) ?? "", /mayor a cero/);
    assert.ok(paymentPartsError(100, [{ metodo: "BITCOIN", monto: 100 }]));
    assert.ok(paymentPartsError(100, []));
    assert.ok(paymentPartsError(100, [{ metodo: "EFECTIVO", monto: 30 }, { metodo: "NEQUI", monto: 30 }, { metodo: "OTRO", monto: 40 }]));
    assert.ok(paymentPartsError(0, [{ metodo: "EFECTIVO", monto: 0 }]));
  });

  test("el método del pago es MIXTO solo con dos partes", () => {
    assert.equal(summaryMethod([{ metodo: "NEQUI", monto: 1 }]), "NEQUI");
    assert.equal(summaryMethod([{ metodo: "NEQUI", monto: 1 }, { metodo: "EFECTIVO", monto: 1 }]), "MIXTO");
  });

  test("al escribir una parte, la otra completa el total sin quedar negativa", () => {
    const parts = [{ metodo: "EFECTIVO", monto: 0 }, { metodo: "NEQUI", monto: 160000 }];
    assert.deepEqual(balanceParts(160000, parts, 0, 100000).map((part) => part.monto), [100000, 60000]);
    assert.deepEqual(balanceParts(160000, parts, 1, 200000).map((part) => part.monto), [0, 160000]);
  });

  test("D4: un pago se reparte entre paquetes en orden y gasta los métodos en orden", () => {
    const result = allocatePayment([180000, 120000], [{ metodo: "EFECTIVO", monto: 200000 }, { metodo: "NEQUI", monto: 100000 }]);
    assert.deepEqual(result, [
      { monto: 180000, partes: [{ metodo: "EFECTIVO", monto: 180000 }] },
      { monto: 120000, partes: [{ metodo: "EFECTIVO", monto: 20000 }, { metodo: "NEQUI", monto: 100000 }] }
    ]);
  });

  test("D4: un abono menor que el total cubre el primero y deja el resto debiendo", () => {
    const result = allocatePayment([180000, 120000, 50000], [{ metodo: "NEQUI", monto: 200000 }]);
    assert.deepEqual(result.map((item) => item.monto), [180000, 20000, 0]);
    assert.deepEqual(result[2].partes, []);
  });

  test("R11: el desglose por método usa las partes cuando existen", () => {
    assert.deepEqual(methodBreakdown({ monto: 100, metodoPago: "NEQUI" }), [{ metodo: "NEQUI", monto: 100 }]);
    assert.deepEqual(
      methodBreakdown({ monto: 100, metodoPago: "MIXTO", partes: [{ metodo: "EFECTIVO", monto: 70 }, { metodo: "NEQUI", monto: 30 }] }),
      [{ metodo: "EFECTIVO", monto: 70 }, { metodo: "NEQUI", monto: 30 }]
    );
  });

  test("R4: la API acepta el metodoPago de siempre o las partes", () => {
    assert.deepEqual(resolvePaymentParts(100, { metodoPago: "NEQUI" }), { metodoPago: "NEQUI", partesGuardadas: [], error: null });
    const split = resolvePaymentParts(100, { partes: [{ metodo: "EFECTIVO", monto: 60 }, { metodo: "NEQUI", monto: 40 }] });
    assert.equal(split.metodoPago, "MIXTO");
    assert.equal(split.partesGuardadas.length, 2);
    assert.ok(resolvePaymentParts(100, { partes: [{ metodo: "EFECTIVO", monto: 60 }, { metodo: "NEQUI", monto: 30 }] }).error);
  });
});
