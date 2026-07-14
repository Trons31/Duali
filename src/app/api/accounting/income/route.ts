import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const monthly = await prisma.monthlyPayment.aggregate({ where: { clientId, deletedAt: null, estado: "PAGADO" }, _sum: { monto: true } });
    const supplies = await prisma.suppliesPayment.aggregate({ where: { clientId, deletedAt: null, estado: "PAGADO" }, _sum: { monto: true } });
    const enrollments = await prisma.enrollmentPayment.aggregate({ where: { clientId, deletedAt: null, estado: "PAGADO" }, _sum: { monto: true } });
    return ok({
      mensualidades: Number(monthly._sum.monto ?? 0),
      utiles: Number(supplies._sum.monto ?? 0),
      inscripciones: Number(enrollments._sum.monto ?? 0)
    });
  } catch (error) {
    return handleError(error);
  }
}
