import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DebtInstallmentContext = {
  estudianteId: string;
  monthlyPaymentId: string | null;
  enrollmentPaymentId: string | null;
  saldoRestante: Prisma.Decimal | number | string;
};

export async function getOpenDebtByStudent(clientId: string, studentIds: string[]) {
  const uniqueStudentIds = Array.from(new Set(studentIds)).filter(Boolean);
  const debtByStudent = new Map<
    string,
    {
      monthly: Map<string, number>;
      enrollment: Map<string, number>;
      total: number;
    }
  >();

  if (!uniqueStudentIds.length) return debtByStudent;

  const monthlyPayments = await prisma.monthlyPayment.findMany({
    where: {
      clientId,
      deletedAt: null,
      estudianteId: { in: uniqueStudentIds },
      estado: { in: ["PENDIENTE", "ABONADO", "VENCIDO"] }
    },
    select: {
      id: true,
      estudianteId: true,
      monto: true,
      montoAbonado: true,
      saldoPendiente: true
    }
  });
  const enrollmentPayments = await prisma.enrollmentPayment.findMany({
    where: {
      clientId,
      deletedAt: null,
      estudianteId: { in: uniqueStudentIds },
      estado: { in: ["PENDIENTE", "ABONADO", "VENCIDO"] }
    },
    select: {
      id: true,
      estudianteId: true,
      monto: true,
      montoAbonado: true,
      saldoPendiente: true
    }
  });

  for (const studentId of uniqueStudentIds) {
    debtByStudent.set(studentId, {
      monthly: new Map(),
      enrollment: new Map(),
      total: 0
    });
  }

  addBalances(debtByStudent, "monthly", monthlyPayments);
  addBalances(debtByStudent, "enrollment", enrollmentPayments);

  return debtByStudent;
}

export function calculateTotalDebtAfterInstallment(
  installment: DebtInstallmentContext,
  debtByStudent: Awaited<ReturnType<typeof getOpenDebtByStudent>>
) {
  const studentDebt = debtByStudent.get(installment.estudianteId);
  const targetCurrentBalance = installment.monthlyPaymentId
    ? (studentDebt?.monthly.get(installment.monthlyPaymentId) ?? 0)
    : installment.enrollmentPaymentId
      ? (studentDebt?.enrollment.get(installment.enrollmentPaymentId) ?? 0)
      : 0;

  return Math.max((studentDebt?.total ?? 0) - targetCurrentBalance + Number(installment.saldoRestante), 0);
}

function addBalances(
  debtByStudent: Map<string, { monthly: Map<string, number>; enrollment: Map<string, number>; total: number }>,
  kind: "monthly" | "enrollment",
  payments: DebtPaymentBalanceInput[]
) {
  for (const payment of payments) {
    const studentDebt = debtByStudent.get(payment.estudianteId);
    if (!studentDebt) continue;

    const balance = resolvePaymentBalance(payment);
    if (balance <= 0) continue;

    studentDebt[kind].set(payment.id, balance);
    studentDebt.total += balance;
  }
}

type DebtPaymentBalanceInput = {
  id: string;
  estudianteId: string;
  monto: Prisma.Decimal | number | string;
  montoAbonado: Prisma.Decimal | number | string;
  saldoPendiente: Prisma.Decimal | number | string;
};

function resolvePaymentBalance(payment: DebtPaymentBalanceInput) {
  const storedBalance = Number(payment.saldoPendiente);
  if (storedBalance > 0) return storedBalance;

  return Math.max(Number(payment.monto) - Number(payment.montoAbonado), 0);
}
