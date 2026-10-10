import { requireClient } from "@/lib/auth";
import { findSellablePackages, findUsablePackages } from "@/lib/bookings";
import { ApiError, handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isDateKey } from "@/lib/studio-time";

// Antes de reservar: con que paquete se descontaria o, si no tiene, que se le
// puede vender (spec 007 R5).
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId") ?? "";
    const scheduleId = url.searchParams.get("scheduleId") ?? "";
    const fecha = url.searchParams.get("fecha") ?? "";
    if (!memberId || !scheduleId || !isDateKey(fecha)) throw new ApiError(422, "Faltan memberId, scheduleId o fecha");

    const schedule = await prisma.classSchedule.findFirst({ where: { id: scheduleId, clientId }, select: { disciplineId: true } });
    if (!schedule) throw new ApiError(404, "Horario no encontrado");

    const [usable, sellable] = await Promise.all([
      findUsablePackages(prisma, { clientId, memberId, disciplineId: schedule.disciplineId, fecha }),
      findSellablePackages(clientId, schedule.disciplineId)
    ]);

    return ok({
      usable: usable.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        discipline: item.discipline,
        clasesRestantes: item.clases - item.clasesUsadas
      })),
      sellable: sellable.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        clases: item.clases,
        precio: Number(item.precio),
        discipline: item.discipline
      }))
    });
  } catch (error) {
    return handleError(error);
  }
}
