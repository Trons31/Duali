import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicBookingManage } from "@/components/public/public-booking-manage";
import { PublicShell } from "@/components/public/public-shell";
import { getPublicBooking } from "@/lib/public-studio";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mi reserva", robots: { index: false, follow: false } };

type Props = { params: Promise<{ slug: string; token: string }> };

/** Pagina del enlace privado de una reserva web (spec 009 R4). */
export default async function PublicBookingManagePage({ params }: Props) {
  const { slug, token } = await params;
  const booking = await getPublicBooking(token);
  // El slug de la URL debe ser el del estudio de la reserva.
  if (!booking || booking.estudio.slug !== slug) notFound();

  return (
    <PublicShell studio={booking.estudio}>
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <PublicBookingManage token={token} booking={booking} />
      </div>
    </PublicShell>
  );
}
