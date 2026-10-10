import { requireClient } from "@/lib/auth";
import { countFutureActiveBookings } from "@/lib/bookings";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import { memberPackageInclude, serializeMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { dateKeyToDate, dateToDateKey, studioTodayKey } from "@/lib/studio-time";
import { memberPackageUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

// Spec 006 R3: extender el vencimiento (D4) o anular la venta.
export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const sale = await prisma.memberPackage.findFirst({ where: { id, clientId } });
    if (!sale) throw new ApiError(404, "Venta no encontrada");
    if (sale.anuladoAt) throw new ApiError(409, "La venta ya está anulada");

    const body = memberPackageUpdateSchema.parse(await readBody(request));

    if ("vence" in body) {
      if (body.vence < dateToDateKey(sale.inicio)) throw new ApiError(422, "No puede vencer antes de empezar");
      const updated = await prisma.memberPackage.update({
        where: { id },
        data: { vence: dateKeyToDate(body.vence) },
        include: memberPackageInclude
      });
      return ok(serializeMemberPackage(updated, studioTodayKey()));
    }

    const upcoming = await countFutureActiveBookings({ clientId, memberPackageId: id });
    if (upcoming) {
      throw new ApiError(409, `Tiene ${upcoming} reserva${upcoming === 1 ? "" : "s"} próximas con este paquete. Cancélalas primero.`);
    }

    // Anular deja la venta y sus pagos como historia, pero ya no cuentan como
    // ingreso ni como saldo (spec 006 R5).
    const updated = await prisma.memberPackage.update({
      where: { id },
      data: { anuladoAt: new Date(), motivoAnulacion: body.motivo ?? null },
      include: memberPackageInclude
    });
    return ok(serializeMemberPackage(updated, studioTodayKey()));
  } catch (error) {
    return handleError(error);
  }
}
