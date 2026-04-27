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
        OR: [{ estado: "VENCIDO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: todayStart } }]
      },
      orderBy: { fechaVencimiento: "asc" },
      include: { student: true, group: true }
    });
    return ok(payments);
  } catch (error) {
    return handleError(error);
  }
}
