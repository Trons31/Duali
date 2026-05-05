import { EnrollmentPayment, MonthlyPayment, Student } from "@prisma/client";

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
  monto: string | number;
  isMinor?: boolean;
  isOverdue?: boolean;
  fechaVencimiento?: Date;
}) {
  const amount = Number(params.monto).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  });
  const ownerText = params.isMinor ? `la mensualidad de ${params.studentName}` : "tu mensualidad";

  if (params.isOverdue) {
    const days = calculateOverdueDays(params.fechaVencimiento);
    return `Hola, te recordamos que ${ownerText} esta vencida por un valor de ${amount}. Lleva ${days} dia${days === 1 ? "" : "s"} de retraso. Por favor realiza el pago lo antes posible.`;
  }

  return `Hola, te recordamos que hoy es el dia de pago de ${ownerText} por un valor de ${amount}.`;
}

export function createWhatsappUrl(phone: string, message: string) {
  const normalized = normalizeWhatsappPhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildEnrollmentReminderMessage(params: {
  studentName: string;
  monto: string | number;
  isMinor?: boolean;
  isOverdue?: boolean;
  fechaVencimiento?: Date;
}) {
  const amount = Number(params.monto).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  });
  const ownerText = params.isMinor ? `la inscripcion de ${params.studentName}` : "tu inscripcion";

  if (params.isOverdue) {
    const days = calculateOverdueDays(params.fechaVencimiento);
    return `Hola, te recordamos que ${ownerText} esta vencida por un valor de ${amount}. Lleva ${days} dia${days === 1 ? "" : "s"} de retraso. Por favor realiza el pago lo antes posible.`;
  }

  return `Hola, te recordamos que hoy es el dia de pago de ${ownerText} por un valor de ${amount}.`;
}

export function buildReminderForPayment(
  payment: MonthlyPayment & { student: Pick<Student, "nombre" | "apellido" | "esMenorDeEdad" | "telefonoPadre" | "celular"> }
) {
  const phone = resolveWhatsappPhone(payment.student);
  const message = buildPaymentReminderMessage({
    studentName: `${payment.student.nombre} ${payment.student.apellido}`,
    monto: payment.monto.toString(),
    isMinor: payment.student.esMenorDeEdad,
    isOverdue: payment.estado === "VENCIDO",
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
    isMinor: payment.student.esMenorDeEdad,
    isOverdue: payment.estado === "VENCIDO",
    fechaVencimiento: payment.fechaVencimiento
  });

  return {
    phone: normalizeWhatsappPhone(phone),
    message,
    whatsappUrl: createWhatsappUrl(phone, message)
  };
}

function calculateOverdueDays(fechaVencimiento?: Date) {
  if (!fechaVencimiento) return 1;

  const dueUtc = Date.UTC(
    fechaVencimiento.getFullYear(),
    fechaVencimiento.getMonth(),
    fechaVencimiento.getDate()
  );
  const now = new Date();
  const nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.max(1, Math.floor((nowUtc - dueUtc) / 86400000));
}
