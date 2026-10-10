import { requireClient } from "@/lib/auth";
import { created, handleError, readBody } from "@/lib/http";
import { memberPackageInclude, renewMemberPackage, serializeMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { studioTodayKey } from "@/lib/studio-time";
import { memberPackageRenewSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

// Spec 020 R3: renovar un plan (mismo paquete, encadenado a la venta anterior).
export async function POST(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = memberPackageRenewSchema.parse(await readBody(request));
    const today = studioTodayKey();

    const sale = await prisma.$transaction(async (tx) => {
      const renewal = await renewMemberPackage(tx, { ...body, clientId, saleId: id, today });
      return tx.memberPackage.findUniqueOrThrow({ where: { id: renewal.id }, include: memberPackageInclude });
    });

    return created(serializeMemberPackage(sale, today));
  } catch (error) {
    return handleError(error);
  }
}
