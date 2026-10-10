// Textos de los avisos del estudio (spec 011). Funciones puras: se prueban sin base.
import { dateKeyToDate, formatTimeKey } from "@/lib/studio-time";

export function formatLongDateKey(key: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    dateKeyToDate(key)
  );
}

export function formatShortDateKey(key: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(dateKeyToDate(key));
}

export function formatDayMonth(key: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(dateKeyToDate(key));
}

export function money(value: number) {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

/** wa.me con el mensaje armado; celulares de 10 digitos se asumen de Colombia. */
export function whatsappHref(celular: string, message: string) {
  const digits = celular.replace(/\D/g, "");
  const phone = digits.length === 10 ? `57${digits}` : digits;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

const signature = (businessName: string, pageUrl?: string | null) =>
  [`— ${businessName}`, pageUrl ? `Horario y reservas: ${pageUrl}` : null].filter(Boolean).join("\n");

export function classReminderMessage(input: {
  businessName: string;
  nombre: string;
  disciplina: string;
  fecha: string;
  horaInicio: string;
  pageUrl?: string | null;
}) {
  return [
    `Hola ${input.nombre} 👋`,
    `Te recordamos tu clase de ${input.disciplina} el ${formatLongDateKey(input.fecha)} a las ${formatTimeKey(input.horaInicio)}.`,
    "Si no puedes asistir, avísanos para liberar tu cupo.",
    signature(input.businessName, input.pageUrl)
  ].join("\n");
}

export function expiringPackageMessage(input: {
  businessName: string;
  nombre: string;
  paquete: string;
  disciplina: string;
  clasesRestantes: number;
  vence: string;
  pageUrl?: string | null;
}) {
  const clases =
    input.clasesRestantes === 0
      ? "Ya usaste todas tus clases"
      : input.clasesRestantes === 1
        ? "Te queda 1 clase"
        : `Te quedan ${input.clasesRestantes} clases`;
  return [
    `Hola ${input.nombre} 👋`,
    `${clases} de tu plan ${input.paquete} de ${input.disciplina}, que vence el ${formatLongDateKey(input.vence)}.`,
    "¿Quieres renovarlo? Te apartamos tu cupo.",
    signature(input.businessName, input.pageUrl)
  ].join("\n");
}

export function balanceMessage(input: {
  businessName: string;
  nombre: string;
  paquete: string;
  disciplina: string;
  saldo: number;
  paymentMethods: Array<{ name: string; account: string }>;
}) {
  const methods = input.paymentMethods
    .map((method) => [method.name, method.account].filter(Boolean).join(": "))
    .filter(Boolean);
  return [
    `Hola ${input.nombre} 👋`,
    `Tienes un saldo pendiente de ${money(input.saldo)} de tu plan ${input.paquete} de ${input.disciplina}.`,
    methods.length ? `Puedes pagar a:\n${methods.map((line) => `• ${line}`).join("\n")}` : null,
    "Cuando pagues, envíanos el comprobante por aquí. ¡Gracias!",
    `— ${input.businessName}`
  ]
    .filter(Boolean)
    .join("\n");
}

/** Spec 020 R8: plan vencido sin renovar. */
export function expiredPackageMessage(input: {
  businessName: string;
  nombre: string;
  paquete: string;
  disciplina: string;
  vence: string;
  pageUrl?: string | null;
}) {
  return [
    `Hola ${input.nombre} 👋`,
    `Tu plan ${input.paquete} de ${input.disciplina} venció el ${formatLongDateKey(input.vence)}. ¡Te extrañamos!`,
    "¿Quieres renovarlo? Te apartamos tu cupo.",
    signature(input.businessName, input.pageUrl)
  ].join("\n");
}

/** Spec 020 R8/R9: saldo que paso su fecha limite. */
export function overdueBalanceMessage(input: {
  businessName: string;
  nombre: string;
  paquete: string;
  disciplina: string;
  saldo: number;
  fechaLimite: string;
  paymentMethods: Array<{ name: string; account: string }>;
}) {
  const methods = input.paymentMethods
    .map((method) => [method.name, method.account].filter(Boolean).join(": "))
    .filter(Boolean);
  return [
    `Hola ${input.nombre} 👋`,
    `Tu saldo de ${money(input.saldo)} del plan ${input.paquete} de ${input.disciplina} venció el ${formatLongDateKey(input.fechaLimite)}.`,
    methods.length ? `Puedes pagar a:\n${methods.map((line) => `• ${line}`).join("\n")}` : null,
    "Cuando pagues, envíanos el comprobante por aquí. ¡Gracias!",
    `— ${input.businessName}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function cancelledClassMessage(input: {
  businessName: string;
  nombre: string;
  disciplina: string;
  fecha: string;
  horaInicio: string;
  motivo?: string | null;
  pageUrl?: string | null;
}) {
  return [
    `Hola ${input.nombre}, lo sentimos 🙏`,
    `La clase de ${input.disciplina} del ${formatLongDateKey(input.fecha)} a las ${formatTimeKey(input.horaInicio)} se canceló${input.motivo ? ` (${input.motivo})` : ""}.`,
    "Tu clase quedó devuelta a tu plan para que reserves otra.",
    signature(input.businessName, input.pageUrl)
  ].join("\n");
}

/** Spec 015 R5: a quien le llego un cupo de la lista de espera. */
export function waitlistSpotMessage(input: {
  businessName: string;
  nombre: string;
  disciplina: string;
  fecha: string;
  horaInicio: string;
  saldo: number;
  horasCancelacion: number;
  bookingUrl?: string | null;
}) {
  return [
    `Hola ${input.nombre} 🎉`,
    `¡Se liberó un cupo! Quedaste en ${input.disciplina} el ${formatLongDateKey(input.fecha)} a las ${formatTimeKey(input.horaInicio)}.`,
    input.saldo > 0 ? `Tu plan queda por pagar: ${money(input.saldo)}.` : null,
    input.bookingUrl
      ? `Si ya no puedes ir, cancélalo con ${input.horasCancelacion} h de anticipación y recuperas la clase:\n${input.bookingUrl}`
      : `Si ya no puedes ir, avísanos con ${input.horasCancelacion} h de anticipación y recuperas la clase.`,
    `— ${input.businessName}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function digestBody(input: { clases: number; reservas: number; porVencer: number; porCobrar: number }) {
  const parts = [
    input.clases ? `${input.clases} clase${input.clases === 1 ? "" : "s"} y ${input.reservas} reserva${input.reservas === 1 ? "" : "s"}` : "Sin clases",
    input.porVencer ? `${input.porVencer} paquete${input.porVencer === 1 ? "" : "s"} por vencer` : null,
    input.porCobrar > 0 ? `${money(input.porCobrar)} por cobrar` : null
  ];
  return `Hoy: ${parts.filter(Boolean).join(" · ")}`;
}
