import { requireAdminApi } from "@/lib/admin-auth";
import { handleError, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureClientSubscription, serializeSubscription } from "@/lib/subscriptions";

export async function GET() {
  try {
    await requireAdminApi();

    const clients = await prisma.client.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" }
    });

    const clientsWithSubscriptions = [];

    for (const client of clients) {
      const subscription = await ensureClientSubscription(client.id);

      clientsWithSubscriptions.push({
        id: client.id,
        nombre: client.nombre,
        email: client.email,
        telefono: client.telefono,
        businessName: client.businessName,
        createdAt: client.createdAt.toISOString(),
        subscription: serializeSubscription(subscription)
      });
    }

    const active = clientsWithSubscriptions.filter((client) => client.subscription.status === "ACTIVA").length;
    const overdue = clientsWithSubscriptions.filter((client) => client.subscription.status === "VENCIDA").length;
    const monthlyRevenue = clientsWithSubscriptions.reduce((sum, client) => sum + client.subscription.price, 0);

    return ok({
      clients: clientsWithSubscriptions,
      summary: {
        totalClients: clientsWithSubscriptions.length,
        active,
        overdue,
        monthlyRevenue
      }
    });
  } catch (error) {
    return handleError(error);
  }
}
