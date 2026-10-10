import { notFound } from "next/navigation";
import { StudioMemberDetail } from "@/components/dashboard/studio-member-detail";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import { apiFetch } from "@/lib/server-api";
import { studioTodayKey } from "@/lib/studio-time";
import type { ClassHistoryItem } from "@/lib/attendance";
import type { ReceiptView } from "@/lib/receipts";
import type { ReminderItem } from "@/lib/studio-reminders";
import { WebApiError } from "@/lib/web-api-errors";
import { auth } from "@/lib/web-auth";
import type { BookingItem, DisciplineItem, PackageItem, SafeClient, StudioMemberItem } from "@/lib/web-types";

export default async function StudioMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Clientes" />;

  const { id } = await params;
  const [member, disciplines, packages, bookings, receipts, classHistory, profile, reminders] = await Promise.all([
    apiFetch<StudioMemberItem>(`/api/studio-members/${id}`).catch((error) => {
      if (error instanceof WebApiError && error.status === 404) notFound();
      throw error;
    }),
    apiFetch<DisciplineItem[]>("/api/disciplines"),
    apiFetch<PackageItem[]>("/api/packages"),
    apiFetch<BookingItem[]>(`/api/bookings?memberId=${id}`).catch(() => []),
    apiFetch<ReceiptView[]>(`/api/payment-receipts?memberId=${id}`).catch(() => []),
    apiFetch<ClassHistoryItem[]>(`/api/studio-members/${id}/history`).catch(() => []),
    apiFetch<SafeClient>("/api/client/profile").catch(() => null),
    apiFetch<Record<string, ReminderItem[]>>(`/api/studio-reminders?memberId=${id}`).catch(() => null)
  ]);
  // Spec 020 R9: un aviso por venta, el mas urgente primero.
  const saleReminders: Record<string, ReminderItem> = {};
  for (const key of ["saldosVencidos", "vencidos", "porVencer", "saldos"]) {
    for (const item of reminders?.[key] ?? []) if (item.saleId && !saleReminders[item.saleId]) saleReminders[item.saleId] = item;
  }

  return (
    <StudioMemberDetail
      member={member}
      today={studioTodayKey()}
      disciplines={disciplines.filter((discipline) => discipline.activa)}
      packages={packages}
      bookings={bookings}
      receipts={receipts}
      classHistory={classHistory}
      diasPlazoSaldo={profile?.diasPlazoSaldo ?? 7}
      reminders={saleReminders}
    />
  );
}
