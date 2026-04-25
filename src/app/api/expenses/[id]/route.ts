import { requireClient } from "@/lib/auth";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { expenseSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const expense = await prisma.expense.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!expense) throw new ApiError(404, "Gasto no encontrado");
    return ok(expense);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = expenseSchema.partial().parse(await readBody(request));
    const exists = await prisma.expense.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Gasto no encontrado");
    const expense = await prisma.expense.update({ where: { id }, data: body });
    return ok(expense);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const exists = await prisma.expense.findFirst({ where: { id, clientId, deletedAt: null } });
    if (!exists) throw new ApiError(404, "Gasto no encontrado");
    await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
