import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { notificationPromptMode, shouldAutoOpenNotificationPrompt } from "@/lib/notification-prompt";

const desktop = { isIOS: false, isStandalone: false };

describe("invitación a activar notificaciones (spec 026)", () => {
  test("R2: con permiso sin decidir se ofrece activar", () => {
    assert.equal(notificationPromptMode({ ...desktop, permission: "default" }), "ask");
  });

  test("R2: concedido o sin soporte no se ofrece nada", () => {
    assert.equal(notificationPromptMode({ ...desktop, permission: "granted" }), "hidden");
    assert.equal(notificationPromptMode({ ...desktop, permission: "unsupported" }), "hidden");
  });

  test("R6: bloqueado se explica, no se pide", () => {
    assert.equal(notificationPromptMode({ ...desktop, permission: "denied" }), "blocked");
  });

  test("R3: iPhone sin instalar pide instalar; instalado pide normal", () => {
    assert.equal(notificationPromptMode({ isIOS: true, isStandalone: false, permission: "unsupported" }), "ios-install");
    assert.equal(notificationPromptMode({ isIOS: true, isStandalone: true, permission: "default" }), "ask");
  });

  test("R2/R4: solo se abre solo una vez y nunca si está bloqueado o concedido", () => {
    assert.equal(shouldAutoOpenNotificationPrompt("ask", false), true);
    assert.equal(shouldAutoOpenNotificationPrompt("ios-install", false), true);
    assert.equal(shouldAutoOpenNotificationPrompt("ask", true), false);
    assert.equal(shouldAutoOpenNotificationPrompt("blocked", false), false);
    assert.equal(shouldAutoOpenNotificationPrompt("hidden", false), false);
  });
});
