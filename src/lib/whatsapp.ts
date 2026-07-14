import type { Client, EnrollmentPayment, MonthlyPayment, Student } from "@prisma/client";
import { OVERDUE_PAYMENT_MESSAGE_TEMPLATES } from "@/lib/whatsapp-template";

type ReminderClient = Pick<Client, "businessName"> &
  Partial<Pick<Client, "paymentMethods" | "paymentMethodItems" | "whatsappMessageTemplate">>;

type ReminderStudent = Pick<
  Student,
  "nombre" | "apellido" | "esMenorDeEdad" | "telefonoPadre" | "celular" | "precioMensualidad"
>;

type PaymentReminderItem = {
  kind: "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";
  id: string;
  estudianteId: string;
  monto: unknown;
  saldoPendiente?: unknown;
  estado: string;
  fechaVencimiento: Date;
  mes?: number | null;
  anio?: number | null;
  student: ReminderStudent;
};

const MONTH_NAMES = [
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

type PaymentMethodItem = {
  name: string;
  account: string;
};

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
  concept?: "mensualidad" | "inscripcion";
  client?: ReminderClient;
}) {
  const item: PaymentReminderItem = {
    kind: params.concept === "inscripcion" ? "ENROLLMENT_PAYMENT" : "MONTHLY_PAYMENT",
    id: "",
    estudianteId: "",
    monto: params.monto,
    estado: params.isOverdue ? "VENCIDO" : "PENDIENTE",
    fechaVencimiento: params.fechaVencimiento ?? new Date(),
    student: {
      nombre: params.studentName,
      apellido: "",
      esMenorDeEdad: Boolean(params.isMinor),
      telefonoPadre: null,
      celular: null,
      precioMensualidad: null
    }
  };

  return buildPaymentReminderMessageForItems([item], params.client);
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
  client?: ReminderClient;
}) {
  return buildPaymentReminderMessage({ ...params, concept: "inscripcion" });
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
  payment: MonthlyPayment & { student: ReminderStudent },
  client?: ReminderClient
) {
  return buildReminderForPayments([{ ...payment, kind: "MONTHLY_PAYMENT" }], client);
}

export function buildReminderForEnrollment(
  payment: EnrollmentPayment & { student: ReminderStudent },
  client?: ReminderClient
) {
  return buildReminderForPayments([{ ...payment, kind: "ENROLLMENT_PAYMENT" }], client);
}

export function buildReminderForPayments(items: PaymentReminderItem[], client?: ReminderClient) {
  const sortedItems = [...items].sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());
  const primaryItem = sortedItems[0];

  if (!primaryItem) {
    return { phone: "", message: "", whatsappUrl: "" };
  }

  const phone = resolveWhatsappPhone(primaryItem.student);
  const message = buildPaymentReminderMessageForItems(sortedItems, client);

  return {
    phone: normalizeWhatsappPhone(phone),
    message,
    whatsappUrl: createWhatsappUrl(phone, message)
  };
}

function buildPaymentReminderMessageForItems(items: PaymentReminderItem[], client?: ReminderClient) {
  const primaryItem = items[0]!;
  const studentName = fullStudentName(primaryItem.student);
  const isMinor = primaryItem.student.esMenorDeEdad;
  const amount = items.reduce((total, item) => total + paymentRemainingAmount(item), 0);
  const monthlyItems = items.filter((item) => item.kind === "MONTHLY_PAYMENT");
  const overdueMonthlyItems = monthlyItems.filter((item) => item.estado === "VENCIDO" || isDateOverdue(item.fechaVencimiento));
  const enrollmentItems = items.filter((item) => item.kind === "ENROLLMENT_PAYMENT");
  const overdueEnrollmentItems = enrollmentItems.filter((item) => item.estado === "VENCIDO" || isDateOverdue(item.fechaVencimiento));
  const displayedMonthlyItems = overdueMonthlyItems.length ? overdueMonthlyItems : monthlyItems;
  const displayedEnrollmentItems = overdueEnrollmentItems.length ? overdueEnrollmentItems : enrollmentItems;
  const enrollmentAmount = displayedEnrollmentItems.reduce((total, item) => total + paymentRemainingAmount(item), 0);
  const oldestDueDate = primaryItem.fechaVencimiento;
  const isOverdue = items.some((item) => item.estado === "VENCIDO" || isDateOverdue(item.fechaVencimiento));
  const isDueToday = isDateToday(oldestDueDate);
  const days = isOverdue ? calculateOverdueDays(oldestDueDate) : 0;
  const concept = items.length === 1 ? paymentConceptLabel(primaryItem) : "cobros pendientes";
  const detail = items.map(paymentConceptCopy).join(", ");
  const paymentMethods = formatPaymentMethods(client);
  const template = client?.whatsappMessageTemplate?.trim();

  const variables = {
    nombre_alumno: studentName,
    nombre_cliente: studentName,
    nombre_negocio: client?.businessName?.trim() || "nuestro negocio",
    estado_pago: isOverdue
      ? `vencido hace ${days} dia${days === 1 ? "" : "s"}`
      : isDueToday
        ? "pendiente, vence hoy"
        : `pendiente, vence el ${formatDate(oldestDueDate)}`,
    fecha_vencimiento: formatDate(oldestDueDate),
    dias_vencidos: String(days),
    metodos_pago: paymentMethods || "Consulta los metodos de pago disponibles con nosotros.",
    valor_pendiente: formatCop(amount),
    detalle_cobros: detail,
    concepto_pago: concept,
    nombre_estudiante: studentName,
    cantidad_mensualidades_vencidas: String(displayedMonthlyItems.length),
    mensualidades_vencidas: displayedMonthlyItems.map(paymentConceptCopy).join(", "),
    tiene_inscripcion_vencida: displayedEnrollmentItems.length ? "si" : "no",
    valor_inscripcion: formatCop(enrollmentAmount),
    total_pendiente: formatCop(amount),
    valor_mensualidad: formatCop(monthlyFeeForStudent(primaryItem, monthlyItems))
  };

  if (isOverdue) {
    const overdueTemplate = selectOverduePaymentTemplate({
      template,
      monthlyCount: displayedMonthlyItems.length,
      hasEnrollment: displayedEnrollmentItems.length > 0
    });
    let renderedMessage = renderWhatsappTemplate(overdueTemplate, variables);

    return paymentMethods && !templateContainsVariable(overdueTemplate, "metodos_pago")
      ? appendPaymentMethods(renderedMessage, paymentMethods)
      : renderedMessage;
  }

  if (template) {
    let renderedMessage = renderWhatsappTemplate(template, variables);
    if (!templateContainsAnyVariable(template, ["nombre_alumno", "nombre_cliente"])) {
      renderedMessage = `Alumno: ${studentName}\n\n${renderedMessage.trim()}`;
    }

    if (!templateContainsAnyVariable(template, ["estado_pago", "dias_vencidos"])) {
      renderedMessage = appendPaymentStatus(renderedMessage, variables.estado_pago);
    }

    return paymentMethods && !templateContainsVariable(template, "metodos_pago")
      ? appendPaymentMethods(renderedMessage, paymentMethods)
      : renderedMessage;
  }

  const ownerText = isMinor ? `${concept} de ${studentName}` : `tu ${concept}`;
  const methodsSection = paymentMethods ? `\n\nMetodos de pago:\n${paymentMethods}` : "";

  if (isOverdue) {
    return `Hola, te recordamos que ${ownerText} se encuentra vencido por valor de ${formatCop(amount)}. Lleva ${days} dia${days === 1 ? "" : "s"} de retraso. Por favor realiza el pago lo antes posible para ponerte al dia.${methodsSection}`;
  }

  const dueCopy = isDueToday ? "hoy vence" : `vence el ${formatDate(oldestDueDate)}`;
  return `Hola, te recordamos que ${dueCopy} ${ownerText} por valor de ${formatCop(amount)}. Por favor realiza el pago para mantenerte al dia.${methodsSection}`;
}

function renderWhatsappTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) => variables[key] ?? match);
}

function selectOverduePaymentTemplate(params: {
  template?: string;
  monthlyCount: number;
  hasEnrollment: boolean;
}) {
  const baseTemplate = overduePaymentBaseTemplate(params.monthlyCount, params.hasEnrollment);
  return applyCustomOverdueTone(baseTemplate, params.template);
}

function overduePaymentBaseTemplate(monthlyCount: number, hasEnrollment: boolean) {
  if (monthlyCount === 1 && hasEnrollment) return OVERDUE_PAYMENT_MESSAGE_TEMPLATES.singleMonthlyAndEnrollment;
  if (monthlyCount > 1 && hasEnrollment) return OVERDUE_PAYMENT_MESSAGE_TEMPLATES.monthlyAndEnrollment;
  if (hasEnrollment) return OVERDUE_PAYMENT_MESSAGE_TEMPLATES.enrollmentOnly;
  if (monthlyCount === 1) return OVERDUE_PAYMENT_MESSAGE_TEMPLATES.singleMonthly;
  return OVERDUE_PAYMENT_MESSAGE_TEMPLATES.multipleMonthly;
}

function applyCustomOverdueTone(baseTemplate: string, customTemplate?: string) {
  if (!customTemplate) return baseTemplate;

  const customPrefix = customTemplate.split(/{{\s*nombre_estudiante\s*}}/)[0]?.trim();
  const customClosingMatch = /(Por favor[\s\S]*)$/i.exec(customTemplate.trim());
  const defaultClosingMatch = /(Por favor[\s\S]*)$/i.exec(baseTemplate);
  let personalizedTemplate = baseTemplate;

  if (customPrefix) {
    personalizedTemplate = personalizedTemplate.replace(
      /^.*?{{\s*nombre_estudiante\s*}}/,
      `${customPrefix} {{nombre_estudiante}}`
    );
  }

  if (customClosingMatch?.[1] && defaultClosingMatch?.[1]) {
    personalizedTemplate = personalizedTemplate.replace(defaultClosingMatch[1], customClosingMatch[1]);
  }

  return personalizedTemplate;
}

function templateContainsVariable(template: string, variable: string) {
  return new RegExp(`{{\\s*${variable}\\s*}}`).test(template);
}

function templateContainsAnyVariable(template: string, variables: string[]) {
  return variables.some((variable) => templateContainsVariable(template, variable));
}

function appendPaymentMethods(message: string, paymentMethods: string) {
  return `${message.trim()}\n\nMetodos de pago:\n${paymentMethods}`;
}

function appendPaymentStatus(message: string, status: string) {
  return `${message.trim()}\n\nEstado del pago: ${status}.`;
}

function formatPaymentMethods(client?: ReminderClient) {
  const structuredItems = normalizePaymentMethodItems(client?.paymentMethodItems);
  if (structuredItems.length) {
    return structuredItems.map((item) => (item.account ? `- ${item.name}: ${item.account}` : `- ${item.name}`)).join("\n");
  }

  const legacyText = client?.paymentMethods?.trim();
  return legacyText ?? "";
}

function normalizePaymentMethodItems(value: unknown): PaymentMethodItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const name = String(source.name ?? "").trim();
      const account = String(source.account ?? "").trim();
      if (!name && !account) return null;

      return {
        name: name || "Metodo de pago",
        account
      };
    })
    .filter((item): item is PaymentMethodItem => Boolean(item));
}

function paymentRemainingAmount(item: PaymentReminderItem) {
  if (item.saldoPendiente !== undefined && item.saldoPendiente !== null) return Number(item.saldoPendiente.toString());
  return Number(item.monto?.toString() ?? 0);
}

function monthlyFeeForStudent(primaryItem: PaymentReminderItem, monthlyItems: PaymentReminderItem[]) {
  if (primaryItem.student.precioMensualidad !== undefined && primaryItem.student.precioMensualidad !== null) {
    return primaryItem.student.precioMensualidad;
  }

  return monthlyItems[0]?.monto ?? primaryItem.monto;
}

function fullStudentName(student: ReminderStudent) {
  return [student.nombre, student.apellido].filter(Boolean).join(" ").trim();
}

function paymentConceptLabel(item: PaymentReminderItem) {
  return item.kind === "MONTHLY_PAYMENT" ? "mensualidad" : "inscripcion";
}

function paymentConceptCopy(item: PaymentReminderItem) {
  if (item.kind === "MONTHLY_PAYMENT" && item.mes && item.anio) {
    const monthName = MONTH_NAMES[item.mes - 1] ?? String(item.mes);
    return `${capitalize(monthName)} ${item.anio}`;
  }

  return `${capitalize(paymentConceptLabel(item))} con vencimiento ${formatDate(item.fechaVencimiento)}`;
}

function isDateOverdue(fechaVencimiento: Date) {
  const dueUtc = Date.UTC(
    fechaVencimiento.getFullYear(),
    fechaVencimiento.getMonth(),
    fechaVencimiento.getDate()
  );
  const now = new Date();
  const nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return dueUtc < nowUtc;
}

function isDateToday(date: Date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
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

function formatCop(value: unknown) {
  return Number(value?.toString() ?? 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  });
}

function formatDate(date: Date) {
  return date.toLocaleDateString("es-CO");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
