import { Prisma } from "@prisma/client";
import { requireClient } from "@/lib/auth";
import { currentMonthlyPeriod, localDateAtNoon, monthlyDueDateForPeriod, nextMonthlyPeriod, paymentStatusForDueDate } from "@/lib/dates";
import { ApiError, created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { studentSchema } from "@/lib/validations";

type MonthlyPeriod = {
  mes: number;
  anio: number;
};

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const groupId = url.searchParams.get("groupId") ?? undefined;
    const q = (url.searchParams.get("q") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "todos").toLowerCase();
    const page = Math.max(Number(url.searchParams.get("page") ?? "1") || 1, 1);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? "10") || 10, 1), 50);

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
                estado: { in: ["PENDIENTE", "ABONADO", "VENCIDO"] }
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
        mensualidadMetodoPagoActual,
        inscripcionMonto,
        inscripcionPagada,
        inscripcionFechaPago,
        inscripcionMetodoPago,
        inicioClasesDia,
        inicioClasesMes,
        inicioClasesAnio,
        mesesPagados,
        ...studentData
      } = body;
      const fechaInicioClases =
        inicioClasesDia && inicioClasesMes && inicioClasesAnio
          ? localDateAtNoon(inicioClasesAnio, inicioClasesMes, inicioClasesDia)
          : studentData.fechaInicioClases;
      const createdStudent = await tx.student.create({ data: { ...studentData, fechaInicioClases, clientId } as never });

      if (tipoRegistro === "NUEVO" && inscripcionMonto) {
        const fechaVencimiento = new Date();
        await tx.enrollmentPayment.create({
          data: {
            estudianteId: createdStudent.id,
            clientId,
            monto: inscripcionMonto,
            montoAbonado: inscripcionPagada ? inscripcionMonto : 0,
            saldoPendiente: inscripcionPagada ? 0 : inscripcionMonto,
            fechaVencimiento,
            estado: inscripcionPagada ? "PAGADO" : paymentStatusForDueDate(fechaVencimiento),
            fechaPago: inscripcionPagada ? inscripcionFechaPago ?? new Date() : null,
            metodoPago: inscripcionPagada ? inscripcionMetodoPago : null
          }
        });
      }

      const precioMensualidad = body.precioMensualidad;
      const diaCobro = body.diaCobro;
      if (precioMensualidad && diaCobro) {
        const currentPeriod = currentMonthlyPeriod();
        if (tipoRegistro === "ANTIGUO" && inicioClasesMes && inicioClasesAnio) {
          const paidKeys = new Set((mesesPagados ?? []).map((period) => periodKey(period)));
          const periods = monthlyPeriodRange({ mes: inicioClasesMes, anio: inicioClasesAnio }, currentPeriod);

          if (periods.length) {
            await tx.monthlyPayment.createMany({
              data: periods.map((period) => {
                const fechaVencimiento = monthlyDueDateForPeriod(
                  period.mes,
                  period.anio,
                  diaCobro,
                  body.modalidadMensualidad
                );
                const isPaid = paidKeys.has(periodKey(period));
                const isCurrentPeriod = period.mes === currentPeriod.mes && period.anio === currentPeriod.anio;

                return {
                  estudianteId: createdStudent.id,
                  grupoId: createdStudent.grupoId,
                  clientId,
                  mes: period.mes,
                  anio: period.anio,
                  monto: precioMensualidad,
                  montoAbonado: isPaid ? precioMensualidad : 0,
                  saldoPendiente: isPaid ? 0 : precioMensualidad,
                  fechaVencimiento,
                  estado: isPaid ? "PAGADO" : paymentStatusForDueDate(fechaVencimiento),
                  fechaPago: isPaid ? (isCurrentPeriod ? new Date() : fechaVencimiento) : null,
                  metodoPago: isPaid ? mensualidadMetodoPagoActual : null,
                  notas: "Generado al registrar estudiante antiguo"
                };
              }),
              skipDuplicates: true
            });
          }

          return createdStudent;
        }

        const startPeriod =
          tipoRegistro === "NUEVO" && inicioClasesMes && inicioClasesAnio
            ? { mes: inicioClasesMes, anio: inicioClasesAnio }
            : currentPeriod;
        const periods =
          tipoRegistro === "NUEVO" && periodValue(startPeriod) <= periodValue(currentPeriod)
            ? monthlyPeriodRange(startPeriod, currentPeriod)
            : [startPeriod];

        await tx.monthlyPayment.createMany({
          data: periods.map((period, index) => {
            const baseDueDate = monthlyDueDateForPeriod(
              period.mes,
              period.anio,
              diaCobro,
              body.modalidadMensualidad
            );
            const fechaVencimiento =
              index === 0 && fechaInicioClases && baseDueDate < fechaInicioClases ? fechaInicioClases : baseDueDate;
            const isPaid = index === 0 && pagoMesActual;

            return {
              estudianteId: createdStudent.id,
              grupoId: createdStudent.grupoId,
              clientId,
              mes: period.mes,
              anio: period.anio,
              monto: precioMensualidad,
              montoAbonado: isPaid ? precioMensualidad : 0,
              saldoPendiente: isPaid ? 0 : precioMensualidad,
              fechaVencimiento,
              estado: isPaid ? "PAGADO" : paymentStatusForDueDate(fechaVencimiento),
              fechaPago: isPaid ? new Date() : null,
              metodoPago: isPaid ? mensualidadMetodoPagoActual : null,
              notas: tipoRegistro === "NUEVO" ? "Generado al registrar estudiante nuevo" : null
            };
          }),
          skipDuplicates: true
        });
      }

      return createdStudent;
    });
    return created(student);
  } catch (error) {
    return handleError(error);
  }
}

function monthlyPeriodRange(start: MonthlyPeriod, end: MonthlyPeriod) {
  const periods: MonthlyPeriod[] = [];
  let mes = start.mes;
  let anio = start.anio;

  while (anio < end.anio || (anio === end.anio && mes <= end.mes)) {
    periods.push({ mes, anio });
    const next = nextMonthlyPeriod(mes, anio);
    mes = next.mes;
    anio = next.anio;
  }

  return periods;
}

function periodKey(period: MonthlyPeriod) {
  return `${period.anio}-${period.mes}`;
}

function periodValue(period: MonthlyPeriod) {
  return period.anio * 12 + period.mes;
}
