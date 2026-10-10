import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicBookingWizard } from "@/components/public/public-booking-wizard";
import { PublicShell } from "@/components/public/public-shell";
import { PUBLIC_BOOKING_DAYS, getPublicSchedule, getPublishedStudio } from "@/lib/public-studio";
import { studioTodayKey } from "@/lib/studio-time";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ h?: string; f?: string; plan?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const studio = await getPublishedStudio(slug);
  return { title: studio ? `Reservar en ${studio.businessName}` : "Estudio no encontrado", robots: { index: false } };
}

/** Asistente de reserva (specs 009 y 012). ?h&f entra con la clase elegida; ?plan, con el plan. */
export default async function PublicBookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { h, f, plan } = await searchParams;
  const studio = await getPublishedStudio(slug);
  if (!studio) notFound();

  const sessions = await getPublicSchedule(studio.id, PUBLIC_BOOKING_DAYS);

  return (
    <PublicShell studio={studio}>
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <PublicBookingWizard
          studio={{
            slug: studio.slug!,
            businessName: studio.businessName,
            telefono: studio.telefono,
            horasCancelacion: studio.horasCancelacion,
            paymentMethods: studio.paymentMethods
          }}
          sessions={sessions.filter((session) => !session.cancelada)}
          today={studioTodayKey()}
          initial={{ scheduleId: h, fecha: f, planId: plan }}
        />
      </div>
    </PublicShell>
  );
}
