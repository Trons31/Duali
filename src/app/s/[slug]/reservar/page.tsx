import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicBookingWizard } from "@/components/public/public-booking-wizard";
import { PublicShell } from "@/components/public/public-shell";
import { getPublicPlan } from "@/lib/online-plans";
import { purchaseHref } from "@/lib/public-presentation";
import { PUBLIC_BOOKING_DAYS, getPublicSchedule, getPublishedStudio } from "@/lib/public-studio";
import { studioTodayKey } from "@/lib/studio-time";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ h?: string; f?: string; plan?: string; mp?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const studio = await getPublishedStudio(slug);
  return { title: studio ? `Reservar en ${studio.businessName}` : "Estudio no encontrado", robots: { index: false } };
}

/**
 * Asistente de reserva (specs 009, 012 y 021). ?h&f entra con la clase elegida;
 * ?mp=token reserva con ese plan (Mi plan). Los enlaces viejos ?plan= compran el plan.
 */
export default async function PublicBookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { h, f, plan, mp } = await searchParams;
  const studio = await getPublishedStudio(slug);
  if (!studio) notFound();
  if (plan && !mp) redirect(purchaseHref(studio.slug!, plan));

  const myPlan = mp ? await getPublicPlan(mp) : null;
  if (mp && (!myPlan || myPlan.estudio.slug !== studio.slug)) notFound();

  const sessions = (await getPublicSchedule(studio.id, PUBLIC_BOOKING_DAYS)).filter(
    // Desde Mi plan, solo las clases donde sirve el plan (spec 021 R9).
    (session) => !session.cancelada && (!myPlan || myPlan.disciplineIds.includes(session.discipline.id))
  );

  return (
    <PublicShell studio={studio}>
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        {myPlan && !myPlan.puedeReservar ? (
          <div className="rounded-3xl border border-black/[0.06] bg-white p-8 text-center">
            <p className="font-display text-3xl italic">{myPlan.nombre}</p>
            <p className="mt-2 text-sm text-ink-500">{myPlan.motivoNoReserva}</p>
          </div>
        ) : (
          <PublicBookingWizard
            studio={{
              slug: studio.slug!,
              businessName: studio.businessName,
              telefono: studio.telefono,
              horasCancelacion: studio.horasCancelacion,
              paymentMethods: studio.paymentMethods,
              permitirPagoEnEstudio: studio.permitirPagoEnEstudio,
              exigirPagoValidado: studio.exigirPagoValidado
            }}
            sessions={sessions}
            today={studioTodayKey()}
            initial={{ scheduleId: h, fecha: f }}
            planToken={myPlan ? mp : undefined}
          />
        )}
      </div>
    </PublicShell>
  );
}
