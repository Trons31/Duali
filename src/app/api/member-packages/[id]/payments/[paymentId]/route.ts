import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { memberPackageInclude, serializeMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { studioTodayKey } from "@/lib/studio-time";

type Params = { params: Promise<{ id: string; paymentId: string }> };

// Spec 006 R4: anular un pago registrado por error. No se borra: queda la historia.
export async function DELETE(request: Request, context: Params) {
  try {
    const { id, paymentId } = await context.params;
    const { clientId } = await requireClient(request);

    const sale = await prisma.$transaction(async (tx) => {
      const payment = await tx.memberPackagePayment.findFirst({
        where: { id: paymentId, memberPackageId: id, clientId }
      });
      if (!payment) throw new ApiError(404, "Pago no encontrado");
      if (payment.anuladoAt) throw new ApiError(409, "El pago ya está anulado");

      // updateMany con la condicion: si dos peticiones llegan a la vez, solo una
      // descuenta el monto.
      const { count } = await tx.memberPackagePayment.updateMany({
        where: { id: paymentId, anuladoAt: null },
        data: { anuladoAt: new Date() }
      });
      if (count === 0) throw new ApiError(409, "El pago ya está anulado");

      return tx.memberPackage.update({
        where: { id },
        data: { pagado: { decrement: payment.monto } },
        include: memberPackageInclude
      });
    });

    return ok(serializeMemberPackage(sale, studioTodayKey()));
  } catch (error) {
    return handleError(error);
  }
}
