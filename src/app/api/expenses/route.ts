import { requireClient } from "@/lib/auth";
import { created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
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
      orderBy: { fecha: "desc" }
    });

    return ok(expenses);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = expenseSchema.parse(await readBody(request));
    const expense = await prisma.expense.create({ data: { ...body, clientId } });
    return created(expense);
  } catch (error) {
    return handleError(error);
  }
}
