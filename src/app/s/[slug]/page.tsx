import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { PaymentAccounts, PlansExplorer, ScheduleExplorer } from "@/components/public/studio-explorers";
import { ClosingCta, Disciplines, Hero, PostsFeed, SectionHeading } from "@/components/public/studio-sections";
import { listPublishedPosts } from "@/lib/content";
import { joinNames, lowestPrice } from "@/lib/public-presentation";
import { getPublicCatalog, getPublicSchedule, getPublishedStudio } from "@/lib/public-studio";
import { studioTodayKey } from "@/lib/studio-time";

// Cupos en vivo: la pagina se arma en cada visita.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const studio = await getPublishedStudio(slug);
  if (!studio) return { title: "Estudio no encontrado" };
  return {
    title: `${studio.businessName} · Clases y reservas`,
    description: `Planes, horario y cupos de ${studio.businessName}. Aparta tu cupo en línea.`,
    alternates: { canonical: `/s/${studio.slug}` },
    openGraph: {
      title: studio.businessName,
      description: `Aparta tu cupo en ${studio.businessName}.`,
      ...(studio.portadaUrl ? { images: [{ url: studio.portadaUrl }] } : {})
    }
  };
}

/** Pagina publica del estudio (specs 008, 010 y 012). */
export default async function PublicStudioPage({ params }: Props) {
  const { slug } = await params;
  const studio = await getPublishedStudio(slug);
  if (!studio) notFound();

  const [catalog, sessions, posts] = await Promise.all([
    getPublicCatalog(studio.id),
    getPublicSchedule(studio.id),
    listPublishedPosts(studio.id)
  ]);

  const classDisciplines = catalog.filter((discipline) => discipline.tipo === "CLASE");
  const allPlans = catalog.flatMap((discipline) => discipline.packages);
  const hasPlans = allPlans.length > 0;
  const reserve = `/s/${studio.slug}/reservar`;
  // Menu centrado en la barra superior: solo las tres secciones principales.
  const sections = [
    { id: "horario", label: "Horario", show: true },
    { id: "clases", label: "Clases", show: catalog.length > 0 },
    { id: "planes", label: "Planes", show: hasPlans }
  ].filter((section) => section.show);

  return (
    <PublicShell studio={studio} showMobileBar reserveHref={reserve} nav={sections.length > 1 ? sections : []}>
      <Hero
        name={studio.businessName}
        disciplines={joinNames(classDisciplines.map((discipline) => discipline.nombre))}
        colors={catalog.map((discipline) => discipline.color)}
        coverUrl={studio.portadaUrl}
        fromPrice={lowestPrice(allPlans)}
        classesThisWeek={sessions.filter((session) => !session.cancelada).length}
        reserveHref={reserve}
      />


      <div className="mx-auto max-w-5xl space-y-16 px-4 py-10 sm:space-y-20 sm:px-6 sm:py-14">
        <section id="horario" className="scroll-mt-28 md:scroll-mt-20">
          <SectionHeading eyebrow="Esta semana" title="Horario" subtitle="Elige el día y reserva tu cupo." />
          <ScheduleExplorer slug={studio.slug!} sessions={sessions} today={studioTodayKey()} />
        </section>

        {catalog.length ? (
          <section id="clases" className="scroll-mt-28 md:scroll-mt-20">
            <SectionHeading eyebrow="Lo que hacemos" title="Clases" />
            <Disciplines catalog={catalog} />
          </section>
        ) : null}

        {hasPlans ? (
          <section id="planes" className="scroll-mt-28 md:scroll-mt-20">
            <SectionHeading eyebrow="Precios" title="Planes" subtitle="Compra tu plan al reservar; pagas en el estudio o por transferencia." />
            <PlansExplorer slug={studio.slug!} catalog={catalog} />
          </section>
        ) : null}

        {posts.length ? (
          <section id="novedades" className="scroll-mt-28 md:scroll-mt-20">
            <SectionHeading eyebrow="Del estudio" title="Novedades" />
            <PostsFeed posts={posts} />
          </section>
        ) : null}

        {studio.paymentMethods.length ? (
          <section id="pagos" className="scroll-mt-28 md:scroll-mt-20">
            <SectionHeading eyebrow="Pagos" title="Cómo pagar" subtitle="Transfiere y envía el comprobante por WhatsApp." />
            <PaymentAccounts methods={studio.paymentMethods} />
          </section>
        ) : null}
      </div>

      <ClosingCta name={studio.businessName} telefono={studio.telefono} reserveHref={reserve} />
    </PublicShell>
  );
}
