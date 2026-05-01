import { requireClient } from "@/lib/auth";
import { addDays } from "@/lib/dates";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { buildReminderForEnrollment, buildReminderForPayment } from "@/lib/whatsapp";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 5);
    const now = new Date();
    const soon = addDays(now, days);

    const [payments, enrollments] = await Promise.all([
      prisma.monthlyPayment.findMany({
        where: {
          clientId,
          deletedAt: null,
          estado: { in: ["PENDIENTE", "VENCIDO"] },
          fechaVencimiento: { lte: soon }
        },
        include: { student: true, group: true },
        orderBy: { fechaVencimiento: "asc" }
      }),
      prisma.enrollmentPayment.findMany({
        where: {
          clientId,
          deletedAt: null,
          estado: { in: ["PENDIENTE", "VENCIDO"] },
          fechaVencimiento: { lte: soon }
        },
        include: { student: { include: { group: true } } },
        orderBy: { fechaVencimiento: "asc" }
      })
    ]);

    return ok(
      [
        ...payments.map((payment) => ({
        ...payment,
        kind: "MONTHLY_PAYMENT",
        reminder: buildReminderForPayment(payment),
        isOverdue: payment.fechaVencimiento < now
        })),
        ...enrollments.map((payment) => ({
          ...payment,
          kind: "ENROLLMENT_PAYMENT",
          group: payment.student.group,
          reminder: buildReminderForEnrollment(payment),
          isOverdue: payment.fechaVencimiento < now
        }))
      ].sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime())
    );
  } catch (error) {
    return handleError(error);
  }
}
