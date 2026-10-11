import { requireClient } from "@/lib/auth";
import { created, handleError, ok, readBody } from "@/lib/http";
import { memberPackageInclude, sellMemberPackage, sellMemberPackages, serializeMemberPackage } from "@/lib/member-packages";
import { prisma } from "@/lib/prisma";
import { studioTodayKey } from "@/lib/studio-time";
import { memberPackageCartSchema, memberPackageSaleSchema } from "@/lib/validations";

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
// Spec 027 R5: con `items`, varios paquetes en una venta; responde la lista.
export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const raw = await readBody(request);
    const today = studioTodayKey();

    if (raw && typeof raw === "object" && "items" in raw) {
      const cart = memberPackageCartSchema.parse(raw);
      const sales = await prisma.$transaction(async (tx) => {
        const sold = await sellMemberPackages(tx, { ...cart, clientId, today });
        return tx.memberPackage.findMany({ where: { id: { in: sold.map((sale) => sale.id) } }, include: memberPackageInclude });
      });
      // En el orden en que se eligieron.
      const order = new Map(cart.items.map((item, index) => [item.packageId, index]));
      sales.sort((a, b) => (order.get(a.packageId) ?? 0) - (order.get(b.packageId) ?? 0));
      return created(sales.map((sale) => serializeMemberPackage(sale, today)));
    }

    const body = memberPackageSaleSchema.parse(raw);

    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await sellMemberPackage(tx, { ...body, clientId, inicio: body.inicio ?? studioTodayKey() });
      return tx.memberPackage.findUniqueOrThrow({ where: { id: newSale.id }, include: memberPackageInclude });
    });

    return created(serializeMemberPackage(sale, studioTodayKey()));
  } catch (error) {
    return handleError(error);
  }
}
