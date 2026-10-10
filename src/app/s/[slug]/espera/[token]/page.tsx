import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { PublicWaitlistManage } from "@/components/public/public-waitlist-manage";
import { getPublicWaitlistEntry } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mi lugar en la lista", robots: { index: false, follow: false } };

type Props = { params: Promise<{ slug: string; token: string }> };

/** Enlace privado de la lista de espera (spec 015 W3). */
export default async function PublicWaitlistPage({ params }: Props) {
  const { slug, token } = await params;
  const entry = await getPublicWaitlistEntry(token);
  if (!entry || entry.estudio.slug !== slug) notFound();
  // Ya le llego el cupo: su enlace lleva a la reserva.
  if (entry.estado === "ASIGNADA" && entry.reservaToken) redirect(`/s/${slug}/reserva/${entry.reservaToken}`);

  return (
    <PublicShell studio={entry.estudio}>
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <PublicWaitlistManage token={token} entry={entry} />
      </div>
    </PublicShell>
  );
}
