import { notFound } from "next/navigation";
import { StudioMemberDetail } from "@/components/dashboard/studio-member-detail";
import { StudioModuleNotice } from "@/components/dashboard/studio-module-notice";
import { getBusinessModules } from "@/lib/business-modules";
import { apiFetch } from "@/lib/server-api";
import { studioTodayKey } from "@/lib/studio-time";
import type { ClassHistoryItem } from "@/lib/attendance";
import type { ReceiptView } from "@/lib/receipts";
import { WebApiError } from "@/lib/web-api-errors";
import { auth } from "@/lib/web-auth";
import type { BookingItem, DisciplineItem, PackageItem, StudioMemberItem } from "@/lib/web-types";

export default async function StudioMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const modules = await getBusinessModules(session?.user?.id ?? "");
  if (!modules.moduloEstudio) return <StudioModuleNotice title="Clientes" />;

  const { id } = await params;
  const [member, disciplines, packages, bookings, receipts, classHistory] = await Promise.all([
    apiFetch<StudioMemberItem>(`/api/studio-members/${id}`).catch((error) => {
      if (error instanceof WebApiError && error.status === 404) notFound();
      throw error;
    }),
    apiFetch<DisciplineItem[]>("/api/disciplines"),
    apiFetch<PackageItem[]>("/api/packages"),
    apiFetch<BookingItem[]>(`/api/bookings?memberId=${id}`).catch(() => []),
    apiFetch<ReceiptView[]>(`/api/payment-receipts?estado=POR_REVISAR&memberId=${id}`).catch(() => []),
    apiFetch<ClassHistoryItem[]>(`/api/studio-members/${id}/history`).catch(() => [])
  ]);

  return (
    <StudioMemberDetail
      member={member}
      today={studioTodayKey()}
      disciplines={disciplines.filter((discipline) => discipline.activa)}
      packages={packages}
      bookings={bookings}
      receipts={receipts}
      classHistory={classHistory}
    />
  );
}
