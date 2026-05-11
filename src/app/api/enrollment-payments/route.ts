import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const studentId = url.searchParams.get("studentId") ?? undefined;
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from") as string) : undefined;
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to") as string) : undefined;

    const payments = await prisma.enrollmentPayment.findMany({
      where: {
        clientId,
        deletedAt: null,
        ...(status ? { estado: status as any } : {}),
        ...(studentId ? { estudianteId: studentId } : {}),
        ...(from || to ? { fechaPago: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
      },
      orderBy: { createdAt: "desc" },
      include: { student: { include: { group: true } }, installments: { orderBy: { numero: "asc" } } }
    });

    return ok(payments);
  } catch (error) {
    return handleError(error);
  }
}
