import { requireClient, sanitizeClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
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
        moduloAcademia: true,
        moduloEstudio: true,
        horasCancelacion: true,
        devolverClaseInasistencia: true,
        permitirPagoEnEstudio: true,
        exigirPagoValidado: true,
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
    await assertSomeModuleActive(clientId, body);
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

// Spec 002 R2: el negocio siempre debe tener al menos un modulo activo. El PUT
// es parcial, asi que lo que no venga se toma de lo guardado.
async function assertSomeModuleActive(
  clientId: string,
  body: { moduloAcademia?: boolean; moduloEstudio?: boolean }
) {
  if (body.moduloAcademia === undefined && body.moduloEstudio === undefined) return;

  const current = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    select: { moduloAcademia: true, moduloEstudio: true }
  });
  const academia = body.moduloAcademia ?? current.moduloAcademia;
  const estudio = body.moduloEstudio ?? current.moduloEstudio;

  if (!academia && !estudio) {
    throw new ApiError(422, "El negocio debe tener al menos un módulo activo");
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
