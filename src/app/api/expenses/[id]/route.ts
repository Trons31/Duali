import { requireClient } from "@/lib/auth";
import { ApiError, handleError, noContent, ok, readBody } from "@/lib/http";
import { assertNotInstructorExpense } from "@/lib/instructor-payments";
import { MIXED_METHOD } from "@/lib/payment-breakdown";
import { paymentPartsOrThrow, savePaymentParts } from "@/lib/payment-parts";
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
    await assertNotInstructorExpense(clientId, id);
    const { partes, metodoPago, ...data } = body;
    const total = body.monto ?? Number(exists.monto);
    // Spec 027: cambiar el metodo, o el monto de un egreso en dos partes, vuelve a validar las partes.
    const changesMethod = Boolean(metodoPago || partes?.length);
    if (!changesMethod && body.monto !== undefined && exists.metodoPago === MIXED_METHOD) {
      throw new ApiError(422, "Este egreso se pagó en dos partes: vuelve a repartir el nuevo monto");
    }
    const expense = await prisma.$transaction(async (tx) => {
      if (!changesMethod) return tx.expense.update({ where: { id }, data });
      const metodo = paymentPartsOrThrow(total, { metodoPago, partes });
      const row = await tx.expense.update({ where: { id }, data: { ...data, metodoPago: metodo.metodoPago } });
      await savePaymentParts(tx, clientId, { expenseId: id }, metodo.partes);
      return row;
    });
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
    await assertNotInstructorExpense(clientId, id);
    await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
