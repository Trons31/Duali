import { requireClient } from "@/lib/auth";
import { created, handleError, readBody } from "@/lib/http";
import { addPackagePayment, memberPackageInclude, serializeMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { studioTodayKey } from "@/lib/studio-time";
import { memberPackagePaymentSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

// Spec 006 R4: abono o pago del saldo de una venta.
export async function POST(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = memberPackagePaymentSchema.parse(await readBody(request));

    const sale = await prisma.$transaction(async (tx) => {
      await addPackagePayment(tx, { clientId, saleId: id, ...body });
      return tx.memberPackage.findUniqueOrThrow({ where: { id }, include: memberPackageInclude });
    });

    return created(serializeMemberPackage(sale, studioTodayKey()));
  } catch (error) {
    return handleError(error);
  }
}
