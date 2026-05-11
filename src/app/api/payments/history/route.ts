import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { calculateTotalDebtAfterInstallment, getOpenDebtByStudent } from "@/lib/student-debt";

function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
}

function resolveMonthRange(rawMonth?: string | null) {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthValue = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : fallback;
  const [year, month] = monthValue.split("-").map(Number);
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);

  return { monthValue, from, to };
}

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const period = url.searchParams.get("period") === "week" ? "week" : "month";
    const { monthValue, from: monthFrom, to: monthTo } = resolveMonthRange(url.searchParams.get("month"));

    const now = new Date();
    const from = period === "week" ? startOfWeek(now) : monthFrom;
    const to = period === "week" ? endOfWeek(now) : monthTo;

    const [monthlyPayments, enrollmentPayments, installments] = await Promise.all([
      prisma.monthlyPayment.findMany({
        where: {
          clientId,
          deletedAt: null,
          estado: "PAGADO",
          cantidadAbonos: 0,
          fechaPago: { gte: from, lte: to }
        },
        orderBy: [{ fechaPago: "desc" }, { createdAt: "desc" }],
        include: {
          student: true,
          group: true
        }
      }),
      prisma.enrollmentPayment.findMany({
        where: {
          clientId,
          deletedAt: null,
          estado: "PAGADO",
          cantidadAbonos: 0,
          fechaPago: { gte: from, lte: to }
        },
        orderBy: [{ fechaPago: "desc" }, { createdAt: "desc" }],
        include: {
          student: {
            include: {
              group: true
            }
          }
        }
      }),
      prisma.paymentInstallment.findMany({
        where: {
          clientId,
          OR: [
            { fechaAbono: { gte: from, lte: to } },
            { createdAt: { gte: from, lte: to } }
          ]
        },
        orderBy: [{ createdAt: "desc" }, { fechaAbono: "desc" }],
        include: {
          student: true,
          monthlyPayment: {
            include: {
              group: true
            }
          },
          enrollmentPayment: {
            include: {
              student: {
                include: {
                  group: true
                }
              }
            }
          }
        }
      })
    ]);
    const debtByStudent = await getOpenDebtByStudent(
      clientId,
      installments.map((installment) => installment.estudianteId)
    );

    const items = [
      ...monthlyPayments.map((payment) => ({
        id: payment.id,
        kind: "MONTHLY_PAYMENT" as const,
        label: "Mensualidad" as const,
        monto: Number(payment.monto),
        fechaPago: (payment.fechaPago ?? payment.createdAt).toISOString(),
        mes: payment.mes,
        anio: payment.anio,
        student: {
          id: payment.student.id,
          nombre: payment.student.nombre,
          apellido: payment.student.apellido
        },
        group: payment.group
          ? {
              id: payment.group.id,
              nombre: payment.group.nombre
            }
          : null
      })),
      ...enrollmentPayments.map((payment) => ({
        id: payment.id,
        kind: "ENROLLMENT_PAYMENT" as const,
        label: "Inscripcion" as const,
        monto: Number(payment.monto),
        fechaPago: (payment.fechaPago ?? payment.createdAt).toISOString(),
        mes: null,
        anio: null,
        student: {
          id: payment.student.id,
          nombre: payment.student.nombre,
          apellido: payment.student.apellido
        },
        group: payment.student.group
          ? {
              id: payment.student.group.id,
              nombre: payment.student.group.nombre
            }
          : null
      })),
      ...installments.map((installment) => {
        const monthlyPayment = installment.monthlyPayment;
        const enrollmentPayment = installment.enrollmentPayment;
        const group = monthlyPayment?.group ?? enrollmentPayment?.student.group ?? null;

        return {
          id: installment.id,
          kind: "PAYMENT_INSTALLMENT" as const,
          label: "Abono" as const,
          monto: Number(installment.monto),
          fechaPago: installment.createdAt.toISOString(),
          mes: monthlyPayment?.mes ?? null,
          anio: monthlyPayment?.anio ?? null,
          concept: installment.concepto,
          paymentMethod: installment.metodoPago,
          remainingBalance: calculateTotalDebtAfterInstallment(installment, debtByStudent),
          student: {
            id: installment.student.id,
            nombre: installment.student.nombre,
            apellido: installment.student.apellido
          },
          group: group
            ? {
                id: group.id,
                nombre: group.nombre
              }
            : null
        };
      })
    ].sort((a, b) => new Date(b.fechaPago).getTime() - new Date(a.fechaPago).getTime());

    const totalAmount = items.reduce((sum, item) => sum + Number(item.monto), 0);

    return ok({
      filters: {
        period,
        month: monthValue
      },
      summary: {
        totalCount: items.length,
        totalAmount,
        from: from.toISOString(),
        to: to.toISOString()
      },
      items
    });
  } catch (error) {
    return handleError(error);
  }
}
