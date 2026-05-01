import { EnrollmentPayment, MonthlyPayment, Student } from "@prisma/client";

const monthNames = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];

export function resolveWhatsappPhone(student: Pick<Student, "esMenorDeEdad" | "telefonoPadre" | "celular">) {
  if (student.esMenorDeEdad && student.telefonoPadre) return student.telefonoPadre;
  return student.celular ?? student.telefonoPadre ?? "";
}

export function normalizeWhatsappPhone(phone: string) {
  const raw = phone.replace(/\D/g, "");
  const defaultCountry = process.env.DEFAULT_WHATSAPP_COUNTRY_CODE ?? "57";

  if (!raw) return "";
  if (raw.startsWith(defaultCountry)) return raw;
  if (raw.length <= 10) return `${defaultCountry}${raw}`;
  return raw;
}

export function buildPaymentReminderMessage(params: {
  studentName: string;
  mes: number;
  anio: number;
  monto: string | number;
  fechaVencimiento: Date;
}) {
  const month = monthNames[params.mes - 1] ?? String(params.mes);
  const amount = Number(params.monto).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  });
  const dueDate = params.fechaVencimiento.toLocaleDateString("es-CO");

  return `Hola, te recordamos que la mensualidad de ${params.studentName} correspondiente al mes de ${month} de ${params.anio} está pendiente por valor de ${amount}. Por favor realizar el pago antes de ${dueDate}.`;
}

export function createWhatsappUrl(phone: string, message: string) {
  const normalized = normalizeWhatsappPhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildEnrollmentReminderMessage(params: {
  studentName: string;
  monto: string | number;
  fechaVencimiento: Date;
}) {
  const amount = Number(params.monto).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  });
  const dueDate = params.fechaVencimiento.toLocaleDateString("es-CO");

  return `Hola, te recordamos que la inscripcion de ${params.studentName} esta pendiente por valor de ${amount}. Por favor realizar el pago antes de ${dueDate}.`;
}

export function buildReminderForPayment(
  payment: MonthlyPayment & { student: Pick<Student, "nombre" | "apellido" | "esMenorDeEdad" | "telefonoPadre" | "celular"> }
) {
  const phone = resolveWhatsappPhone(payment.student);
  const message = buildPaymentReminderMessage({
    studentName: `${payment.student.nombre} ${payment.student.apellido}`,
    mes: payment.mes,
    anio: payment.anio,
    monto: payment.monto.toString(),
    fechaVencimiento: payment.fechaVencimiento
  });

  return {
    phone: normalizeWhatsappPhone(phone),
    message,
    whatsappUrl: createWhatsappUrl(phone, message)
  };
}

export function buildReminderForEnrollment(
  payment: EnrollmentPayment & { student: Pick<Student, "nombre" | "apellido" | "esMenorDeEdad" | "telefonoPadre" | "celular"> }
) {
  const phone = resolveWhatsappPhone(payment.student);
  const message = buildEnrollmentReminderMessage({
    studentName: `${payment.student.nombre} ${payment.student.apellido}`,
    monto: payment.monto.toString(),
    fechaVencimiento: payment.fechaVencimiento
  });

  return {
    phone: normalizeWhatsappPhone(phone),
    message,
    whatsappUrl: createWhatsappUrl(phone, message)
  };
}
