import { Prisma } from "@prisma/client";
import { requireClient } from "@/lib/auth";
import { currentMonthlyPeriod, monthlyDueDateForPeriod, nextMonthlyPeriod, paymentStatusForDueDate } from "@/lib/dates";
import { ApiError, created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { studentSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const groupId = url.searchParams.get("groupId") ?? undefined;
    const q = (url.searchParams.get("q") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "todos").toLowerCase();
    const page = Math.max(Number(url.searchParams.get("page") ?? "1") || 1, 1);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? "12") || 12, 1), 50);

    const where: Prisma.StudentWhereInput = {
      clientId,
      deletedAt: null,
      ...(groupId ? { grupoId: groupId } : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" as const } },
              { apellido: { contains: q, mode: "insensitive" as const } },
              { celular: { contains: q, mode: "insensitive" as const } },
              { telefonoPadre: { contains: q, mode: "insensitive" as const } }
            ]
          }
        : {}),
      ...(status === "activos" ? { estado: "ACTIVO" as const } : {}),
      ...(status === "inactivos" ? { estado: "INACTIVO" as const } : {}),
      ...(status === "aldia"
        ? {
            monthlyPayments: {
              some: {
                deletedAt: null,
                mes: new Date().getMonth() + 1,
                anio: new Date().getFullYear(),
                estado: "PAGADO" as const
              }
            }
          }
        : {}),
      ...(status === "pendientes"
        ? {
            estado: "ACTIVO" as const,
            monthlyPayments: {
              some: {
                deletedAt: null,
                estado: { in: ["PENDIENTE", "VENCIDO"] }
              }
            }
          }
        : {})
    };

    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          enrollmentPayment: true,
          group: true,
          monthlyPayments: {
            where: { deletedAt: null },
            orderBy: [{ anio: "desc" }, { mes: "desc" }],
            take: 6
          }
        }
      })
    ]);

    return ok({
      items: students,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1)
      },
      filters: {
        q,
        status: ["todos", "activos", "aldia", "pendientes", "inactivos"].includes(status) ? status : "todos",
        groupId
      }
    });
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
      const createdStudent = await tx.student.create({ data: { ...studentData, clientId } as never });

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
        const fechaVencimiento = monthlyDueDateForPeriod(
          firstPeriod.mes,
          firstPeriod.anio,
          body.diaCobro,
          body.modalidadMensualidad
        );

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
