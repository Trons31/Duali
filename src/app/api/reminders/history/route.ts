import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const reminders = await prisma.reminder.findMany({
      where: { clientId },
      include: { student: true, monthlyPayment: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return ok(reminders);
  } catch (error) {
    return handleError(error);
  }
}
