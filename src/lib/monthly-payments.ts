import { currentMonthlyPeriod, endOfCurrentMonth, monthlyDueDateForPeriod, paymentStatusForDueDate, startOfLocalDay } from "./dates";
import { isDatabaseConnectionError } from "./db-errors";
import { prisma } from "./prisma";
import { reactivateExpiredStudentPauses } from "./student-billing";

const pendingEnsures = new Map<string, Promise<void>>();
const lastSuccessfulEnsure = new Map<string, number>();
// Las mensualidades se generan una vez al mes por estudiante: revisar cada 30s
// era un findMany por cada navegacion del dashboard. 5 minutos es de sobra.
const ENSURE_CACHE_MS = Number(process.env.ENSURE_MONTHLY_CACHE_MS ?? "300000");

export function ensureCurrentMonthlyPayments(clientId: string) {
  const lastEnsure = lastSuccessfulEnsure.get(clientId) ?? 0;
  if (Date.now() - lastEnsure < ENSURE_CACHE_MS) return Promise.resolve();

  const pending = pendingEnsures.get(clientId);
  if (pending) return pending;

  const ensure = runEnsureCurrentMonthlyPayments(clientId)
    .then(() => {
      lastSuccessfulEnsure.set(clientId, Date.now());
    })
    .catch((error: unknown) => {
      // Generar mensualidades es mantenimiento en segundo plano: si la base de
      // datos no responde no tiene sentido tumbar el render de la pagina. Se
      // reintenta solo en la siguiente navegacion porque no marcamos el ensure
      // como exitoso. Cualquier otro error si se propaga.
      if (!isDatabaseConnectionError(error)) throw error;
      console.warn(`[monthly-payments] sin conexion a la base de datos para el cliente ${clientId}; se reintentara luego.`);
    })
    .finally(() => {
      if (pendingEnsures.get(clientId) === ensure) pendingEnsures.delete(clientId);
    });

  pendingEnsures.set(clientId, ensure);
  return ensure;
}

async function runEnsureCurrentMonthlyPayments(clientId: string) {
  await reactivateExpiredStudentPauses(prisma, clientId);

  const { mes, anio } = currentMonthlyPeriod();
  const todayStart = startOfLocalDay();
  const students = await prisma.student.findMany({
    where: {
      clientId,
      deletedAt: null,
      estado: "ACTIVO",
      OR: [{ fechaInicioClases: null }, { fechaInicioClases: { lte: endOfCurrentMonth() } }],
      precioMensualidad: { not: null },
      diaCobro: { not: null },
      monthlyPayments: {
        none: {
          deletedAt: null,
          OR: [
            { mes, anio },
            { fechaVencimiento: { gte: todayStart } }
          ]
        }
      }
    }
  }) as Array<{
    id: string;
    grupoId: string;
    precioMensualidad: number | string | null;
    diaCobro: number | null;
    modalidadMensualidad?: "ANTICIPADA" | "VENCIDA";
  }>;

  if (students.length === 0) return;

  await prisma.monthlyPayment.createMany({
    data: students.map((student) => {
      const fechaVencimiento = monthlyDueDateForPeriod(
        mes,
        anio,
        student.diaCobro ?? 10,
        student.modalidadMensualidad ?? "ANTICIPADA"
      );
      return {
        estudianteId: student.id,
        grupoId: student.grupoId,
        clientId,
        mes,
        anio,
        monto: student.precioMensualidad ?? 0,
        saldoPendiente: student.precioMensualidad ?? 0,
        fechaVencimiento,
        estado: paymentStatusForDueDate(fechaVencimiento)
      };
    }),
    skipDuplicates: true
  });
}
