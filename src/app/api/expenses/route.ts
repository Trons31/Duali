import { requireClient } from "@/lib/auth";
import { created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { paymentPartsOrThrow, savePaymentParts, serializeParts } from "@/lib/payment-parts";
import { expenseSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const categoria = url.searchParams.get("categoria") ?? undefined;

    const expenses = await prisma.expense.findMany({
      where: {
        clientId,
        deletedAt: null,
        ...(categoria ? { categoria } : {}),
        ...(from || to
          ? {
              fecha: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {})
              }
            }
          : {})
      },
      orderBy: { fecha: "desc" },
      include: { methodParts: { select: { metodo: true, monto: true } } }
    });

    return ok(expenses.map(({ methodParts, ...expense }) => ({ ...expense, partes: serializeParts(methodParts) })));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = expenseSchema.parse(await readBody(request));
    const { partes: _partes, ...data } = body;
    // Spec 027 D8: un egreso nuevo siempre dice con que se pago.
    const metodo = paymentPartsOrThrow(body.monto, body);
    const expense = await prisma.$transaction(async (tx) => {
      const row = await tx.expense.create({ data: { ...data, metodoPago: metodo.metodoPago, clientId } });
      await savePaymentParts(tx, clientId, { expenseId: row.id }, metodo.partes);
      return row;
    });
    return created({ ...expense, partes: metodo.partes });
  } catch (error) {
    return handleError(error);
  }
}
