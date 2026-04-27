import { requireClient } from "@/lib/auth";
import { startOfLocalDay, startOfNextLocalDay } from "@/lib/dates";
import { handleError, ok } from "@/lib/http";
import { ensureCurrentMonthlyPayments } from "@/lib/monthly-payments";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    await ensureCurrentMonthlyPayments(clientId);
    const todayStart = startOfLocalDay();
    const tomorrowStart = startOfNextLocalDay();
    const payments = await prisma.monthlyPayment.findMany({
      where: {
        clientId,
        deletedAt: null,
        estado: "PENDIENTE",
        fechaVencimiento: { gte: todayStart, lt: tomorrowStart }
      },
      orderBy: { fechaVencimiento: "asc" },
      include: { student: true, group: true }
    });
    return ok(payments);
  } catch (error) {
    return handleError(error);
  }
}
