import { requireClient } from "@/lib/auth";
import { currentMonthlyPeriod, localDateAtNoon, nextMonthlyPeriod, paymentStatusForDueDate } from "@/lib/dates";
import { ApiError, created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { studentSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const groupId = url.searchParams.get("groupId") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;

    const students = await prisma.student.findMany({
      where: {
        clientId,
        deletedAt: null,
        ...(groupId ? { grupoId: groupId } : {}),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { apellido: { contains: q, mode: "insensitive" } },
                { celular: { contains: q, mode: "insensitive" } },
                { telefonoPadre: { contains: q, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: "desc" },
      include: {
        enrollmentPayment: true,
        group: true,
        monthlyPayments: {
          where: { deletedAt: null },
          orderBy: [{ anio: "desc" }, { mes: "desc" }],
          take: 6
        }
      }
    });

    return ok(students);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = studentSchema.parse(await readBody(request));
    const group = await prisma.group.findFirst({ where: { id: body.grupoId, clientId, deletedAt: null } });
    if (!group) throw new ApiError(404, "Grupo no encontrado");

    const student = await prisma.$transaction(async (tx) => {
      const {
        tipoRegistro,
        pagoMesActual,
        inscripcionMonto,
        inscripcionPagada,
        inscripcionFechaPago,
        inscripcionMetodoPago,
        ...studentData
      } = body;
      const createdStudent = await tx.student.create({ data: { ...studentData, clientId } });

      if (tipoRegistro === "NUEVO" && inscripcionMonto) {
        const fechaVencimiento = new Date();
        await tx.enrollmentPayment.create({
          data: {
            estudianteId: createdStudent.id,
            clientId,
            monto: inscripcionMonto,
            fechaVencimiento,
            estado: inscripcionPagada ? "PAGADO" : paymentStatusForDueDate(fechaVencimiento),
            fechaPago: inscripcionPagada ? inscripcionFechaPago ?? new Date() : null,
            metodoPago: inscripcionPagada ? inscripcionMetodoPago : null
          }
        });
      }

      if (body.precioMensualidad && body.diaCobro) {
        const currentPeriod = currentMonthlyPeriod();
        const firstPeriod = tipoRegistro === "NUEVO" || pagoMesActual
          ? nextMonthlyPeriod(currentPeriod.mes, currentPeriod.anio)
          : currentPeriod;
        const fechaVencimiento = localDateAtNoon(firstPeriod.anio, firstPeriod.mes, body.diaCobro);

        await tx.monthlyPayment.create({
          data: {
            estudianteId: createdStudent.id,
            grupoId: createdStudent.grupoId,
            clientId,
            mes: firstPeriod.mes,
            anio: firstPeriod.anio,
            monto: body.precioMensualidad,
            fechaVencimiento,
            estado: paymentStatusForDueDate(fechaVencimiento)
          }
        });
      }

      return createdStudent;
    });
    return created(student);
  } catch (error) {
    return handleError(error);
  }
}
