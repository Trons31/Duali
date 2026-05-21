import { requireClient, sanitizeClient } from "@/lib/auth";
import { handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientProfileSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const client = await prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: {
        id: true,
        nombre: true,
        email: true,
        telefono: true,
        businessName: true,
        paymentMethods: true,
        paymentMethodItems: true,
        whatsappMessageTemplate: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return ok(client);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = clientProfileSchema.parse(await readBody(request));
    const data = {
      ...body,
      paymentMethods: body.paymentMethodItems ? formatLegacyPaymentMethods(body.paymentMethodItems) : body.paymentMethods
    };
    const client = await prisma.client.update({ where: { id: clientId }, data });
    return ok(sanitizeClient(client));
  } catch (error) {
    return handleError(error);
  }
}

function formatLegacyPaymentMethods(items: Array<{ name: string; account: string }>) {
  return items
    .map((item) => {
      const name = item.name.trim();
      const account = item.account.trim();
      if (name && account) return `${name}: ${account}`;
      return name || account;
    })
    .filter(Boolean)
    .join("\n");
}
