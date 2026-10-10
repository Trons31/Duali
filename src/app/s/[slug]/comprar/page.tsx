import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PlanPurchaseWizard } from "@/components/public/plan-purchase-wizard";
import { PublicShell } from "@/components/public/public-shell";
import { getPublicPlan } from "@/lib/online-plans";
import { myPlanHref } from "@/lib/public-presentation";
import { getPublicCatalog, getPublishedStudio } from "@/lib/public-studio";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; renueva?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const studio = await getPublishedStudio(slug);
  return { title: studio ? `Comprar plan en ${studio.businessName}` : "Estudio no encontrado", robots: { index: false } };
}

/** Spec 021 R1: comprar un plan (?p=packageId) sin pedir clase. Spec 020 R13: ?renueva={token de Mi plan}. */
export default async function PublicPurchasePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p: packageId, renueva } = await searchParams;
  const studio = await getPublishedStudio(slug);
  if (!studio) notFound();

  const previous = renueva ? await getPublicPlan(renueva) : null;
  if (renueva && (!previous || previous.estudio.slug !== studio.slug)) notFound();
  // Ya renovado o sin poder renovar en linea: Mi plan explica por que.
  if (renueva && previous && !previous.puedeRenovar) redirect(myPlanHref(studio.slug!, renueva));
  const p = previous ? previous.packageId : packageId;

  const catalog = await getPublicCatalog(studio.id);
  const owner = catalog.find((discipline) => discipline.packages.some((item) => item.id === p));
  const item = owner?.packages.find((entry) => entry.id === p);
  // Un plan que ya no existe o esta oculto: de vuelta a los planes.
  if (!owner || !item) redirect(`/s/${studio.slug}#planes`);

  return (
    <PublicShell studio={studio}>
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <PlanPurchaseWizard
          studio={{
            slug: studio.slug!,
            businessName: studio.businessName,
            paymentMethods: studio.paymentMethods,
            permitirPagoEnEstudio: studio.permitirPagoEnEstudio,
            exigirPagoValidado: studio.exigirPagoValidado
          }}
          plan={{
            id: item.id,
            nombre: item.nombre,
            clases: item.clases,
            precio: item.precio,
            vigenciaDias: item.vigenciaDias,
            discipline: { nombre: owner.nombre, color: owner.color },
            incluye: owner.incluye
          }}
          renewal={renueva && previous ? { token: renueva, nombre: previous.nombreCliente, inicio: previous.inicioRenovacion } : undefined}
        />
      </div>
    </PublicShell>
  );
}
