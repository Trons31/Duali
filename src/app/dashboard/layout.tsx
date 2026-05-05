import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { NotificationBootstrap } from "@/components/notifications/notification-bootstrap";
import { auth } from "@/lib/web-auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.apiToken) {
    redirect("/auth/login");
  }

  return (
    <DashboardShell user={session.user}>
      <NotificationBootstrap />
      {children}
      <div className="h-24 xl:hidden" />
    </DashboardShell>
  );
}
