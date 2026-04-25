import { requireClient } from "@/lib/auth";
import { addDays } from "@/lib/dates";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { buildReminderForPayment } from "@/lib/whatsapp";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 5);
    const now = new Date();
    const soon = addDays(now, days);

    const payments = await prisma.monthlyPayment.findMany({
      where: {
        clientId,
        deletedAt: null,
        estado: { in: ["PENDIENTE", "VENCIDO"] },
        fechaVencimiento: { lte: soon }
      },
      include: { student: true, group: true },
      orderBy: { fechaVencimiento: "asc" }
    });

    return ok(
      payments.map((payment) => ({
        ...payment,
        reminder: buildReminderForPayment(payment),
        isOverdue: payment.fechaVencimiento < now
      }))
    );
  } catch (error) {
    return handleError(error);
  }
}
