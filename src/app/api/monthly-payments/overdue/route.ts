import { requireClient } from "@/lib/auth";
import { startOfLocalDay } from "@/lib/dates";
import { handleError, ok } from "@/lib/http";
import { ensureCurrentMonthlyPayments } from "@/lib/monthly-payments";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    await ensureCurrentMonthlyPayments(clientId);
    const todayStart = startOfLocalDay();
    const payments = await prisma.monthlyPayment.findMany({
      where: {
        clientId,
        deletedAt: null,
        student: { estado: "ACTIVO", deletedAt: null },
        OR: [
          { estado: "VENCIDO" },
          { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } },
          { estado: "ABONADO", saldoPendiente: { gt: 0 } }
        ]
      },
      orderBy: { fechaVencimiento: "asc" },
      include: { student: true, group: true, installments: { orderBy: { numero: "asc" } } }
    });
    const enrollments = await prisma.enrollmentPayment.findMany({
      where: {
        clientId,
        deletedAt: null,
        student: { estado: "ACTIVO", deletedAt: null },
        OR: [
          { estado: "VENCIDO" },
          { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } },
          { estado: "ABONADO", saldoPendiente: { gt: 0 } }
        ]
      },
      orderBy: { fechaVencimiento: "asc" },
      include: { student: { include: { group: true } }, installments: { orderBy: { numero: "asc" } } }
    });

    return ok([
      ...payments.map((payment) => ({ ...payment, kind: "MONTHLY_PAYMENT" })),
      ...enrollments.map((payment) => ({ ...payment, kind: "ENROLLMENT_PAYMENT", group: payment.student.group }))
    ].sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime()));
  } catch (error) {
    return handleError(error);
  }
}
