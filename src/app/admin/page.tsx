import { AdminSubscriptionsPanel } from "@/components/admin/admin-subscriptions-panel";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { ensureClientSubscription, serializeSubscription } from "@/lib/subscriptions";
import type { AdminSubscriptionsResponse } from "@/lib/web-types";

export default async function AdminPage() {
  await requireAdminPage();

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

  const data: AdminSubscriptionsResponse = {
    clients: clientsWithSubscriptions,
    summary: {
      totalClients: clientsWithSubscriptions.length,
      active: clientsWithSubscriptions.filter((client) => client.subscription.status === "ACTIVA").length,
      overdue: clientsWithSubscriptions.filter((client) => client.subscription.status === "VENCIDA").length,
      monthlyRevenue: clientsWithSubscriptions.reduce((sum, client) => sum + client.subscription.price, 0)
    }
  };

  return <AdminSubscriptionsPanel data={data} />;
}
