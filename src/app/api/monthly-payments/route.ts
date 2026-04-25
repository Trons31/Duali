import { requireClient } from "@/lib/auth";
import { ApiError, created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { monthlyPaymentSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const studentId = url.searchParams.get("studentId") ?? undefined;
    const groupId = url.searchParams.get("groupId") ?? undefined;

    const payments = await prisma.monthlyPayment.findMany({
      where: {
        clientId,
        deletedAt: null,
        ...(status ? { estado: status as any } : {}),
        ...(studentId ? { estudianteId: studentId } : {}),
        ...(groupId ? { grupoId: groupId } : {})
      },
      orderBy: { fechaVencimiento: "desc" },
      include: { student: true, group: true }
    });

    return ok(payments);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = monthlyPaymentSchema.parse(await readBody(request));
    const student = await prisma.student.findFirst({
      where: { id: body.estudianteId, clientId, deletedAt: null },
      include: { group: true }
    });
    if (!student) throw new ApiError(404, "Estudiante no encontrado");

    const payment = await prisma.monthlyPayment.create({
      data: {
        ...body,
        grupoId: student.grupoId,
        clientId,
        estado: body.fechaVencimiento < new Date() ? "VENCIDO" : "PENDIENTE"
      }
    });

    return created(payment);
  } catch (error) {
    return handleError(error);
  }
}
