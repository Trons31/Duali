import Link from "next/link";
import type { ReactNode } from "react";
import { FiCalendar, FiMessageCircle } from "react-icons/fi";
import { PublicMobileMenu } from "@/components/public/public-mobile-menu";
import { BrandLogo } from "@/components/shared/brand-logo";
import { cn } from "@/lib/web-utils";

// Marco de las paginas publicas del estudio (spec 012): claro, calido y editorial.

export function studioWhatsappUrl(telefono: string | null, message?: string) {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, "");
  const phone = digits.length === 10 ? `57${digits}` : digits;
  return `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-950 focus-visible:ring-offset-2 focus-visible:ring-offset-sand";

export function PublicShell({
  studio,
  children,
  showMobileBar = false,
  reserveHref,
  nav = []
}: {
  studio: { businessName: string; slug: string | null; telefono: string | null };
  children: ReactNode;
  /** Atajos a las secciones de la portada, centrados en la barra superior. */
  nav?: Array<{ id: string; label: string }>;
  /** Spec 012 R7: barra fija de reserva en el celular (solo en la portada del estudio). */
  showMobileBar?: boolean;
  reserveHref?: string;
}) {
  const whatsapp = studioWhatsappUrl(studio.telefono);
  const reserve = reserveHref ?? `/s/${studio.slug}/reservar`;

  return (
    <div className="flex min-h-[100svh] flex-col bg-sand text-ink-950 antialiased">
      <header className="sticky top-0 z-50 border-b border-black/[0.06] bg-sand">
        <div
          className={cn(
            "mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6",
            nav.length > 0 && "md:grid md:grid-cols-[1fr_auto_1fr]"
          )}
        >
          <Link href={`/s/${studio.slug}`} className={`flex min-w-0 items-center gap-2.5 justify-self-start rounded-full ${focusRing}`}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-950 font-display text-lg italic text-white">
              {studio.businessName.charAt(0).toUpperCase()}
            </span>
            <span className="truncate font-display text-2xl leading-none">{studio.businessName}</span>
          </Link>
          {nav.length > 0 ? <SectionLinks items={nav} className="hidden md:flex" /> : null}
          <div className="flex shrink-0 items-center gap-2 justify-self-end">
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Escribir por WhatsApp"
                className={`flex size-11 items-center justify-center rounded-full border border-black/10 bg-white text-ink-800 transition hover:border-black/20 ${focusRing}`}
              >
                <FiMessageCircle className="size-[18px]" />
              </a>
            ) : null}
            <Link
              href={reserve}
              className={`hidden min-h-11 items-center gap-2 rounded-full bg-ink-950 px-5 text-sm font-semibold text-white transition hover:bg-ink-800 sm:inline-flex ${focusRing}`}
            >
              Reservar clase
            </Link>
            {nav.length > 0 ? <PublicMobileMenu items={nav} reserveHref={reserve} /> : null}
          </div>
        </div>
      </header>

      <main className={showMobileBar ? "flex-1 pb-24 sm:pb-0" : "flex-1"}>{children}</main>

      <footer className={`border-t border-black/[0.06] py-8 ${showMobileBar ? "pb-28 sm:pb-8" : ""}`}>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 text-center">
          <p className="font-display text-xl italic">{studio.businessName}</p>
          <p className="flex items-center gap-1.5 text-xs text-ink-400">
            <BrandLogo size={16} />
            Reservas con Duali
          </p>
        </div>
      </footer>

      {showMobileBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] bg-sand/95 p-3 backdrop-blur-md sm:hidden">
          <div className="flex gap-2">
            <Link
              href={reserve}
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink-950 text-sm font-semibold text-white active:scale-[0.98] ${focusRing}`}
            >
              <FiCalendar className="size-4" />
              Reservar clase
            </Link>
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Escribir por WhatsApp"
                className={`flex size-12 items-center justify-center rounded-full border border-black/10 bg-white ${focusRing}`}
              >
                <FiMessageCircle className="size-5" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionLinks({ items, className }: { items: Array<{ id: string; label: string }>; className?: string }) {
  return (
    <nav aria-label="Secciones" className={cn("items-center justify-center gap-1", className)}>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium text-ink-600 transition hover:bg-black/5 hover:text-ink-950 ${focusRing}`}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
