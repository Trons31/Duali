import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPlanView } from "@/components/public/public-plan-view";
import { PublicShell } from "@/components/public/public-shell";
import { getPublicPlan } from "@/lib/online-plans";
import { getPublishedStudio } from "@/lib/public-studio";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; token: string }> };

export const metadata: Metadata = { title: "Mi plan", robots: { index: false, follow: false } };

/** Spec 021 R8: Mi plan, con el enlace privado. */
export default async function MyPlanPage({ params }: Props) {
  const { slug, token } = await params;
  const [studio, plan] = await Promise.all([getPublishedStudio(slug), getPublicPlan(token)]);
  if (!studio || !plan || plan.estudio.slug !== studio.slug) notFound();

  return (
    <PublicShell studio={studio}>
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <PublicPlanView token={token} initial={plan} />
      </div>
    </PublicShell>
  );
}
