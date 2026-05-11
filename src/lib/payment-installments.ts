import { Prisma } from "@prisma/client";
import { monthlyDueDateForPeriod, nextMonthlyPeriod, paymentStatusForDueDate } from "@/lib/dates";
import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  buildPaymentInstallmentMessage,
  createWhatsappUrl,
  normalizeWhatsappPhone,
  resolveWhatsappPhone
} from "@/lib/whatsapp";

export type InstallmentPaymentKind = "MONTHLY_PAYMENT" | "ENROLLMENT_PAYMENT";

type RegisterInstallmentInput = {
  clientId: string;
  paymentId: string;
  kind: InstallmentPaymentKind;
  monto: number;
  metodoPago: string;
  fechaAbono?: Date;
  notas?: string | null;
  registeredByUserId?: string | null;
  registeredByName?: string | null;
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

export async function getPaymentInstallments(clientId: string, paymentId: string, kind: InstallmentPaymentKind) {
  const where =
    kind === "MONTHLY_PAYMENT"
      ? { clientId, monthlyPaymentId: paymentId }
      : { clientId, enrollmentPaymentId: paymentId };

  return prisma.paymentInstallment.findMany({
    where,
    orderBy: { numero: "asc" }
  });
}

export async function registerPaymentInstallment(input: RegisterInstallmentInput) {
  const method = input.metodoPago.trim();
  const amountCents = toCents(input.monto);
  const paidAt = input.fechaAbono ?? new Date();

  if (amountCents <= 0) {
    throw new ApiError(422, "El valor del abono debe ser mayor a cero");
  }

  if (!method) {
    throw new ApiError(422, "Debes seleccionar un metodo de pago");
  }

  const result = await prisma.$transaction(async (tx) => {
    if (input.kind === "MONTHLY_PAYMENT") {
      return registerMonthlyInstallment(tx, input, amountCents, method, paidAt);
    }

    return registerEnrollmentInstallment(tx, input, amountCents, method, paidAt);
  });

  await persistStudentInstallmentMessage(input.clientId, result).catch((error) => {
    console.error("No se pudo guardar el mensaje automatico del abono", error);
  });

  return result;
}

async function registerMonthlyInstallment(
  tx: Prisma.TransactionClient,
  input: RegisterInstallmentInput,
  amountCents: number,
  method: string,
  paidAt: Date
) {
  const payment = await tx.monthlyPayment.findFirst({
    where: { id: input.paymentId, clientId: input.clientId, deletedAt: null },
    include: {
      student: true,
      group: true,
      installments: { orderBy: { numero: "asc" } }
    }
  });

  if (!payment) throw new ApiError(404, "Mensualidad no encontrada");
  if (payment.estado === "PAGADO") throw new ApiError(409, "Esta mensualidad ya esta pagada");

  const concept = monthlyConcept(payment.mes, payment.anio);
  const balance = resolveBalance(payment.monto, payment.installments);
  const installment = await createInstallment(tx, {
    input,
    paymentIdField: "monthlyPaymentId",
    studentId: payment.estudianteId,
    concept,
    amountCents,
    method,
    paidAt,
    currentBalanceCents: balance.remainingCents,
    installmentCount: payment.installments.length
  });

  const paidAmountCents = balance.paidCents + amountCents;
  const isPaid = installment.saldoRestante.toNumber() === 0;

  const updatedPayment = await tx.monthlyPayment.update({
    where: { id: payment.id },
    data: {
      estado: isPaid ? "PAGADO" : "ABONADO",
      fechaPago: isPaid ? paidAt : null,
      metodoPago: isPaid ? method : payment.metodoPago,
      montoAbonado: fromCents(paidAmountCents),
      saldoPendiente: installment.saldoRestante,
      cantidadAbonos: installment.numero,
      ultimoMetodoAbono: method,
      fechaUltimoAbono: paidAt
    },
    include: {
      student: true,
      group: true,
      installments: { orderBy: { numero: "asc" } }
    }
  });

  if (isPaid && payment.student.estado === "ACTIVO") {
    await createNextMonthlyPaymentIfNeeded(tx, payment, input.clientId);
  }

  return {
    payment: updatedPayment,
    installment,
    studentMessage: buildPaymentInstallmentMessage({
      studentName: `${payment.student.nombre} ${payment.student.apellido}`,
      concept,
      amount: installment.monto.toNumber(),
      paymentMethod: method,
      paidAt,
      totalPaid: paidAmountCents / 100,
      remainingBalance: installment.saldoRestante.toNumber(),
      installmentNumber: installment.numero
    }),
    studentPhone: normalizeWhatsappPhone(resolveWhatsappPhone(payment.student)),
    kind: input.kind
  };
}

async function registerEnrollmentInstallment(
  tx: Prisma.TransactionClient,
  input: RegisterInstallmentInput,
  amountCents: number,
  method: string,
  paidAt: Date
) {
  const payment = await tx.enrollmentPayment.findFirst({
    where: { id: input.paymentId, clientId: input.clientId, deletedAt: null },
    include: {
      student: { include: { group: true } },
      installments: { orderBy: { numero: "asc" } }
    }
  });

  if (!payment) throw new ApiError(404, "Inscripcion no encontrada");
  if (payment.estado === "PAGADO") throw new ApiError(409, "Esta inscripcion ya esta pagada");

  const concept = "Inscripcion";
  const balance = resolveBalance(payment.monto, payment.installments);
  const installment = await createInstallment(tx, {
    input,
    paymentIdField: "enrollmentPaymentId",
    studentId: payment.estudianteId,
    concept,
    amountCents,
    method,
    paidAt,
    currentBalanceCents: balance.remainingCents,
    installmentCount: payment.installments.length
  });

  const paidAmountCents = balance.paidCents + amountCents;
  const isPaid = installment.saldoRestante.toNumber() === 0;

  const updatedPayment = await tx.enrollmentPayment.update({
    where: { id: payment.id },
    data: {
      estado: isPaid ? "PAGADO" : "ABONADO",
      fechaPago: isPaid ? paidAt : null,
      metodoPago: isPaid ? method : payment.metodoPago,
      montoAbonado: fromCents(paidAmountCents),
      saldoPendiente: installment.saldoRestante,
      cantidadAbonos: installment.numero,
      ultimoMetodoAbono: method,
      fechaUltimoAbono: paidAt
    },
    include: {
      student: { include: { group: true } },
      installments: { orderBy: { numero: "asc" } }
    }
  });

  return {
    payment: updatedPayment,
    installment,
    studentMessage: buildPaymentInstallmentMessage({
      studentName: `${payment.student.nombre} ${payment.student.apellido}`,
      concept,
      amount: installment.monto.toNumber(),
      paymentMethod: method,
      paidAt,
      totalPaid: paidAmountCents / 100,
      remainingBalance: installment.saldoRestante.toNumber(),
      installmentNumber: installment.numero
    }),
    studentPhone: normalizeWhatsappPhone(resolveWhatsappPhone(payment.student)),
    kind: input.kind
  };
}

async function createInstallment(
  tx: Prisma.TransactionClient,
  params: {
    input: RegisterInstallmentInput;
    paymentIdField: "monthlyPaymentId" | "enrollmentPaymentId";
    studentId: string;
    concept: string;
    amountCents: number;
    method: string;
    paidAt: Date;
    currentBalanceCents: number;
    installmentCount: number;
  }
) {
  if (params.currentBalanceCents <= 0) {
    throw new ApiError(409, "Este pago no tiene saldo pendiente");
  }

  if (params.amountCents > params.currentBalanceCents) {
    throw new ApiError(422, "El abono no puede ser mayor al saldo pendiente");
  }

  const remainingCents = params.currentBalanceCents - params.amountCents;

  return tx.paymentInstallment.create({
    data: {
      clientId: params.input.clientId,
      estudianteId: params.studentId,
      [params.paymentIdField]: params.input.paymentId,
      numero: params.installmentCount + 1,
      concepto: params.concept,
      monto: fromCents(params.amountCents),
      metodoPago: params.method,
      fechaAbono: params.paidAt,
      saldoAnterior: fromCents(params.currentBalanceCents),
      saldoRestante: fromCents(remainingCents),
      registradoPorUserId: params.input.registeredByUserId,
      registradoPorNombre: params.input.registeredByName,
      notas: params.input.notas
    }
  });
}

async function createNextMonthlyPaymentIfNeeded(
  tx: Prisma.TransactionClient,
  payment: Prisma.MonthlyPaymentGetPayload<{ include: { student: true } }>,
  clientId: string
) {
  const studentBillingMode =
    (payment.student as { modalidadMensualidad?: "ANTICIPADA" | "VENCIDA" }).modalidadMensualidad ?? "ANTICIPADA";
  const nextPeriod = nextMonthlyPeriod(payment.mes, payment.anio);
  const billingDay = payment.student.diaCobro ?? payment.fechaVencimiento.getDate();
  const fechaVencimiento = monthlyDueDateForPeriod(nextPeriod.mes, nextPeriod.anio, billingDay, studentBillingMode);
  const existingNextPayment = await tx.monthlyPayment.findUnique({
    where: {
      estudianteId_mes_anio: {
        estudianteId: payment.estudianteId,
        mes: nextPeriod.mes,
        anio: nextPeriod.anio
      }
    }
  });

  if (existingNextPayment) return;

  const monto = payment.student.precioMensualidad ?? payment.monto;

  await tx.monthlyPayment.create({
    data: {
      estudianteId: payment.estudianteId,
      grupoId: payment.grupoId,
      clientId,
      mes: nextPeriod.mes,
      anio: nextPeriod.anio,
      monto,
      saldoPendiente: monto,
      fechaVencimiento,
      estado: paymentStatusForDueDate(fechaVencimiento)
    }
  });
}

async function persistStudentInstallmentMessage(
  clientId: string,
  result: {
    payment: { estudianteId: string; id: string };
    installment: { id: string };
    studentPhone: string;
    studentMessage: string;
    kind: InstallmentPaymentKind;
  }
) {
  if (!result.studentPhone) return;

  const data = {
    clientId,
    estudianteId: result.payment.estudianteId,
    phone: result.studentPhone,
    message: result.studentMessage,
    whatsappUrl: createWhatsappUrl(result.studentPhone, result.studentMessage),
    status: "PENDIENTE" as const
  };

  await prisma.reminder.create({
    data:
      result.kind === "MONTHLY_PAYMENT"
        ? { ...data, monthlyPaymentId: result.payment.id }
        : { ...data, enrollmentPaymentId: result.payment.id }
  });
}

function resolveBalance(
  totalAmount: Prisma.Decimal | number | string,
  installments: Array<{ monto: Prisma.Decimal | number | string }>
) {
  const totalCents = toCents(totalAmount);
  const paidCents = installments.reduce((sum, item) => sum + toCents(item.monto), 0);
  const remainingCents = Math.max(totalCents - paidCents, 0);

  return { totalCents, paidCents, remainingCents };
}

function monthlyConcept(month: number, year: number) {
  const monthName = MONTH_NAMES[month - 1] ?? String(month);
  return `Mensualidad ${capitalize(monthName)} ${year}`;
}

function toCents(value: Prisma.Decimal | number | string) {
  return Math.round(Number(value) * 100);
}

function fromCents(value: number) {
  return new Prisma.Decimal(value).div(100);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
