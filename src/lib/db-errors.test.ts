import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Prisma } from "@prisma/client";
import { DB_OFFLINE_DIGEST, isDatabaseConnectionError, isOfflineDigest, safeInstanceOf } from "@/lib/db-errors";

describe("errores de conexión (spec 018)", () => {
  test("instanceof seguro: los sustitutos de Prisma del navegador no lanzan", () => {
    const arrow = () => undefined; // funcion sin prototype, como el error reportado
    const throwing = new Proxy(function () {}, {
      get() {
        throw new Error("no disponible en el navegador");
      }
    });
    assert.equal(safeInstanceOf(new Error("x"), undefined), false);
    assert.equal(safeInstanceOf(new Error("x"), arrow), false);
    assert.equal(safeInstanceOf(new Error("x"), throwing), false);
    assert.equal(safeInstanceOf(new TypeError("x"), Error), true);
  });

  test("reconoce errores de Prisma por nombre, sin sus clases (como llegan al navegador)", () => {
    assert.equal(isDatabaseConnectionError({ name: "PrismaClientInitializationError", message: "x" }), true);
    assert.equal(isDatabaseConnectionError({ name: "PrismaClientKnownRequestError", code: "P1001" }), true);
    assert.equal(isDatabaseConnectionError({ name: "PrismaClientKnownRequestError", code: "P2002" }), false);
  });

  test("con las clases reales del servidor", () => {
    const known = new Prisma.PrismaClientKnownRequestError("timeout", { code: "P2024", clientVersion: "test" });
    assert.equal(isDatabaseConnectionError(known), true);
    const unique = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    assert.equal(isDatabaseConnectionError(unique), false);
  });

  test("la pantalla de error decide sin lanzar", () => {
    assert.equal(isOfflineDigest({ digest: DB_OFFLINE_DIGEST }), true);
    assert.equal(isOfflineDigest({ message: "Can't reach database server at db:5432" }), true);
    assert.equal(isOfflineDigest(new Error("boom")), false);
    assert.equal(isOfflineDigest(null), false);
  });
});
