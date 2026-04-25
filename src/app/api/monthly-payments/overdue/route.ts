import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const now = new Date();
    const payments = await prisma.monthlyPayment.findMany({
      where: {
        clientId,
        deletedAt: null,
        OR: [{ estado: "VENCIDO" }, { estado: "PENDIENTE", fechaVencimiento: { lt: now } }]
      },
      orderBy: { fechaVencimiento: "asc" },
      include: { student: true, group: true }
    });
    return ok(payments);
  } catch (error) {
    return handleError(error);
  }
}
