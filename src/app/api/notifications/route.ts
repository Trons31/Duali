import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const notifications = await prisma.notification.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return ok(notifications);
  } catch (error) {
    return handleError(error);
  }
}
