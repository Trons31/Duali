import { Prisma } from "@prisma/client";
import { requireClient } from "@/lib/auth";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { groupUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const q = (url.searchParams.get("q") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "todos").toLowerCase();
    const page = Math.max(Number(url.searchParams.get("page") ?? "1") || 1, 1);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? "10") || 10, 1), 50);
    const group = await prisma.group.findFirst({
      where: { id, clientId, deletedAt: null },
      include: {
        _count: { select: { students: true, monthlyPayments: true } }
      }
    });
    if (!group) throw new ApiError(404, "Grupo no encontrado");

    const studentWhere: Prisma.StudentWhereInput = {
      clientId,
      grupoId: id,
      deletedAt: null,
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
      ...(status === "pagados"
        ? {
            monthlyPayments: {
              some: {
                deletedAt: null,
                mes: currentMonth,
                anio: currentYear,
                estado: "PAGADO" as const
              }
            }
          }
        : {}),
      ...(status === "vencidos"
        ? {
            monthlyPayments: {
              some: {
                deletedAt: null,
                mes: currentMonth,
                anio: currentYear,
                estado: "VENCIDO" as const
              }
            }
          }
        : {}),
      ...(status === "pendientes"
        ? {
            monthlyPayments: {
              some: {
                deletedAt: null,
                mes: currentMonth,
                anio: currentYear,
                estado: { in: ["PENDIENTE", "ABONADO", "VENCIDO"] as const }
              }
            }
          }
        : {})
    };

    const [total, students, activeStudents, studentsWithMonthlyFee, pendingCount, overdueCount] = await Promise.all([
      prisma.student.count({ where: studentWhere }),
      prisma.student.findMany({
        where: studentWhere,
        orderBy: [{ estado: "asc" }, { nombre: "asc" }, { apellido: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          monthlyPayments: {
            where: {
              deletedAt: null,
              mes: currentMonth,
              anio: currentYear
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              mes: true,
              anio: true,
              monto: true,
              estado: true,
              fechaVencimiento: true,
              fechaPago: true
            }
          }
        }
      }),
      prisma.student.count({
        where: { clientId, grupoId: id, deletedAt: null, estado: "ACTIVO" }
      }),
      prisma.student.count({
        where: { clientId, grupoId: id, deletedAt: null, estado: "ACTIVO", precioMensualidad: { gt: 0 } }
      }),
      prisma.monthlyPayment.count({
        where: {
          clientId,
          grupoId: id,
          deletedAt: null,
          mes: currentMonth,
          anio: currentYear,
          estado: { in: ["PENDIENTE", "ABONADO"] }
        }
      }),
      prisma.monthlyPayment.count({
        where: {
          clientId,
          grupoId: id,
          deletedAt: null,
          mes: currentMonth,
          anio: currentYear,
          estado: "VENCIDO"
        }
      })
    ]);

    const estimatedIncomeRows = await prisma.student.findMany({
      where: {
        clientId,
        grupoId: id,
        deletedAt: null,
        estado: "ACTIVO",
        precioMensualidad: { gt: 0 }
      },
      select: { precioMensualidad: true }
    });

    const estimatedIncome = estimatedIncomeRows.reduce((sum, student) => sum + Number(student.precioMensualidad ?? 0), 0);

    return ok({
      ...group,
      students,
      period: {
        mes: currentMonth,
        anio: currentYear,
        label: `${currentMonth}/${currentYear}`
      },
      summary: {
        totalStudents: group._count.students,
        activeStudents,
        studentsWithMonthlyFee,
        estimatedIncome,
        pendingCount,
        overdueCount
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1)
      },
      filters: {
        q,
        status: ["todos", "pendientes", "pagados", "vencidos"].includes(status) ? status : "todos"
      }
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = groupUpdateSchema.parse(await readBody(request));
    const exists = await prisma.group.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Grupo no encontrado");
    const group = await prisma.group.update({ where: { id }, data: body });
    return ok(group);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const exists = await prisma.group.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Grupo no encontrado");
    await prisma.group.update({ where: { id }, data: { deletedAt: new Date() } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
