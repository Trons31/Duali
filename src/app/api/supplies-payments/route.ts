import { requireClient } from "@/lib/auth";
import { ApiError, created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { suppliesPaymentSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const payments = await prisma.suppliesPayment.findMany({
      where: { clientId, deletedAt: null, ...(status ? { estado: status as any } : {}) },
      include: { group: true, student: true },
      orderBy: { fechaVencimiento: "asc" }
    });
    return ok(payments);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = suppliesPaymentSchema.parse(await readBody(request));

    if (body.studentIds?.length) {
      const students = await prisma.student.findMany({ where: { id: { in: body.studentIds }, clientId, deletedAt: null } });
      if (students.length !== body.studentIds.length) throw new ApiError(404, "Uno o más estudiantes no existen");
      const result = await prisma.suppliesPayment.createMany({
        data: students.map((student) => ({
          nombreConcepto: body.nombreConcepto,
          descripcion: body.descripcion,
          monto: body.monto,
          grupoId: student.grupoId,
          estudianteId: student.id,
          clientId,
          fechaVencimiento: body.fechaVencimiento
        }))
      });
      return created({ created: result.count });
    }

    if (body.grupoId && !body.estudianteId) {
      const group = await prisma.group.findFirst({ where: { id: body.grupoId, clientId, deletedAt: null } });
      if (!group) throw new ApiError(404, "Grupo no encontrado");
      const students = await prisma.student.findMany({ where: { grupoId: group.id, clientId, estado: "ACTIVO", deletedAt: null } });
      const result = await prisma.suppliesPayment.createMany({
        data: students.map((student) => ({
          nombreConcepto: body.nombreConcepto,
          descripcion: body.descripcion,
          monto: body.monto,
          grupoId: group.id,
          estudianteId: student.id,
          clientId,
          fechaVencimiento: body.fechaVencimiento
        }))
      });
      return created({ created: result.count });
    }

    if (body.estudianteId) {
      const student = await prisma.student.findFirst({ where: { id: body.estudianteId, clientId, deletedAt: null } });
      if (!student) throw new ApiError(404, "Estudiante no encontrado");
    }

    const payment = await prisma.suppliesPayment.create({
      data: {
        nombreConcepto: body.nombreConcepto,
        descripcion: body.descripcion,
        monto: body.monto,
        grupoId: body.grupoId,
        estudianteId: body.estudianteId,
        clientId,
        fechaVencimiento: body.fechaVencimiento
      }
    });

    return created(payment);
  } catch (error) {
    return handleError(error);
  }
}
