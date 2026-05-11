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

export function buildPaymentInstallmentMessage(params: {
  studentName: string;
  concept: string;
  amount: string | number;
  paymentMethod: string;
  paidAt: Date;
  totalPaid: string | number;
  remainingBalance: string | number;
  installmentNumber: number;
}) {
  const amount = formatCop(params.amount);
  const totalPaid = formatCop(params.totalPaid);
  const remainingBalance = formatCop(params.remainingBalance);
  const date = params.paidAt.toLocaleDateString("es-CO");

  if (Number(params.remainingBalance) <= 0 && params.installmentNumber > 1) {
    return `Hola, ${params.studentName}. Tu pago de ${params.concept} ha sido completado correctamente. Ultimo abono: ${amount}. Metodo de pago: ${params.paymentMethod}. Fecha del abono: ${date}. Total abonado acumulado: ${totalPaid}. Saldo restante: ${remainingBalance}.`;
  }

  if (params.installmentNumber === 1) {
    return `Hola, ${params.studentName}. Hemos registrado tu primer abono para ${params.concept}. Valor abonado: ${amount}. Metodo de pago: ${params.paymentMethod}. Fecha del abono: ${date}. Total abonado hasta ahora: ${totalPaid}. Saldo restante: ${remainingBalance}.`;
  }

  return `Hola, ${params.studentName}. Hemos registrado un nuevo abono para ${params.concept}. Valor abonado: ${amount}. Metodo de pago: ${params.paymentMethod}. Fecha del abono: ${date}. Total abonado acumulado: ${totalPaid}. Saldo restante: ${remainingBalance}.`;
}

export function buildPendingBalanceMessage(params: {
  studentName: string;
  concept: string;
  lastAmount: string | number;
  paymentMethod: string;
  paidAt: Date;
  totalPaid: string | number;
  remainingBalance: string | number;
}) {
  return `Hola, ${params.studentName}. Te recordamos que tienes un saldo pendiente para ${params.concept}. Ultimo abono registrado: ${formatCop(params.lastAmount)}. Metodo de pago: ${params.paymentMethod}. Fecha del abono: ${params.paidAt.toLocaleDateString("es-CO")}. Total abonado acumulado: ${formatCop(params.totalPaid)}. Saldo restante: ${formatCop(params.remainingBalance)}.`;
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

function formatCop(value: string | number) {
  return Number(value).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  });
}
