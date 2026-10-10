import { requireClient } from "@/lib/auth";
import { created, handleError, ok, readBody } from "@/lib/http";
import { memberPackageInclude, sellMemberPackage, serializeMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { studioTodayKey } from "@/lib/studio-time";
import { memberPackageSaleSchema } from "@/lib/validations";

const memberSelect = { select: { id: true, nombre: true, apellido: true, celular: true } } as const;

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const sales = await prisma.memberPackage.findMany({
      where: { clientId, member: { deletedAt: null } },
      include: { ...memberPackageInclude, member: memberSelect },
      orderBy: [{ createdAt: "desc" }]
    });

    const today = studioTodayKey();
    return ok(sales.map((sale) => ({ ...serializeMemberPackage(sale, today), member: sale.member })));
  } catch (error) {
    return handleError(error);
  }
}

// Spec 006 R2: vender un paquete, con pago inicial opcional, en una transaccion.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = memberPackageSaleSchema.parse(await readBody(request));

    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await sellMemberPackage(tx, { ...body, clientId, inicio: body.inicio ?? studioTodayKey() });
      return tx.memberPackage.findUniqueOrThrow({ where: { id: newSale.id }, include: memberPackageInclude });
    });

    return created(serializeMemberPackage(sale, studioTodayKey()));
  } catch (error) {
    return handleError(error);
  }
}
