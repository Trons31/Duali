import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  balanceMessage,
  cancelledClassMessage,
  classReminderMessage,
  digestBody,
  expiringPackageMessage,
  waitlistSpotMessage,
  whatsappHref
} from "@/lib/studio-messages";

describe("textos de avisos por WhatsApp (spec 011)", () => {
  test("recordatorio de clase con negocio, disciplina, fecha y hora local", () => {
    const text = classReminderMessage({
      businessName: "Studio Dance",
      nombre: "Laura",
      disciplina: "Body Combat",
      fecha: "2026-10-12",
      horaInicio: "18:00",
      pageUrl: "https://duali.app/s/studiodance"
    });
    assert.match(text, /Hola Laura/);
    assert.match(text, /Body Combat el lunes, 12 de octubre a las 6:00 p\. m\./);
    assert.match(text, /— Studio Dance/);
    assert.match(text, /https:\/\/duali\.app\/s\/studiodance/);
  });

  test("sin página publicada no incluye enlace", () => {
    const text = classReminderMessage({ businessName: "Studio", nombre: "Ana", disciplina: "Jump", fecha: "2026-10-12", horaInicio: "06:30" });
    assert.equal(text.includes("http"), false);
    assert.match(text, /6:30 a\. m\./);
  });

  test("paquete por vencer: singular, plural y agotado", () => {
    const base = { businessName: "S", nombre: "Ana", paquete: "Básico", disciplina: "Rumba", vence: "2026-10-30" };
    assert.match(expiringPackageMessage({ ...base, clasesRestantes: 2 }), /Te quedan 2 clases de tu plan Básico de Rumba, que vence el viernes, 30 de octubre/);
    assert.match(expiringPackageMessage({ ...base, clasesRestantes: 1 }), /Te queda 1 clase/);
    assert.match(expiringPackageMessage({ ...base, clasesRestantes: 0 }), /Ya usaste todas tus clases/);
  });

  test("saldo con monto en pesos y métodos de pago", () => {
    const text = balanceMessage({
      businessName: "S",
      nombre: "Ana",
      paquete: "Plus",
      disciplina: "Jump",
      saldo: 25000,
      paymentMethods: [
        { name: "Nequi", account: "3001234567" },
        { name: "", account: "" }
      ]
    });
    assert.match(text, /saldo pendiente de \$25\.000/);
    assert.match(text, /• Nequi: 3001234567/);
    assert.equal(text.includes("• \n"), false, "no deja viñetas vacías");
  });

  test("clase cancelada con motivo y aviso de clase devuelta", () => {
    const text = cancelledClassMessage({ businessName: "S", nombre: "Ana", disciplina: "Jump", fecha: "2026-10-12", horaInicio: "19:00", motivo: "festivo" });
    assert.match(text, /se canceló \(festivo\)/);
    assert.match(text, /devuelta/);
  });

  test("enlace de WhatsApp: 57 para celulares de 10 dígitos y texto codificado", () => {
    assert.equal(whatsappHref("300 123 4567", "Hola & chao"), "https://wa.me/573001234567?text=Hola%20%26%20chao");
    assert.equal(whatsappHref("13055550101", "x"), "https://wa.me/13055550101?text=x");
  });

  test("resumen del día", () => {
    assert.equal(digestBody({ clases: 5, reservas: 38, porVencer: 3, porCobrar: 120000 }), "Hoy: 5 clases y 38 reservas · 3 paquetes por vencer · $120.000 por cobrar");
    assert.equal(digestBody({ clases: 1, reservas: 1, porVencer: 0, porCobrar: 0 }), "Hoy: 1 clase y 1 reserva");
    assert.equal(digestBody({ clases: 0, reservas: 0, porVencer: 1, porCobrar: 0 }), "Hoy: Sin clases · 1 paquete por vencer");
  });
});

describe("cupo de la lista de espera (spec 015 R5)", () => {
  const base = {
    businessName: "Studio Dance",
    nombre: "Laura",
    disciplina: "Body Combat",
    fecha: "2026-10-12",
    horaInicio: "18:00",
    horasCancelacion: 2
  };

  test("con saldo y enlace de la reserva", () => {
    const text = waitlistSpotMessage({ ...base, saldo: 15000, bookingUrl: "https://duali.app/s/studiodance/reserva/abc" });
    assert.match(text, /^Hola Laura/);
    assert.match(text, /Se liberó un cupo! Quedaste en Body Combat el lunes, 12 de octubre a las 6:00 p\. m\./);
    assert.match(text, /por pagar: \$15\.000/);
    assert.match(text, /2 h de anticipación/);
    assert.match(text, /\/reserva\/abc$/m);
    assert.match(text, /— Studio Dance$/);
  });

  test("sin saldo ni enlace no inventa datos", () => {
    const text = waitlistSpotMessage({ ...base, saldo: 0 });
    assert.doesNotMatch(text, /por pagar/);
    assert.doesNotMatch(text, /https?:/);
    assert.match(text, /avísanos con 2 h/);
  });
});
