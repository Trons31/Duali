import Link from "next/link";
import { FiArrowRight, FiMessageCircle } from "react-icons/fi";
import { focusRing, studioWhatsappUrl } from "@/components/public/public-shell";
import { ScrollHint } from "@/components/shared/scroll-hint";
import { formatCop } from "@/lib/public-presentation";
import { cn } from "@/lib/web-utils";

// Secciones de la pagina publica (spec 012). Componentes de servidor: el
// contenido se ve sin esperar JavaScript.

export type CatalogItem = {
  id: string;
  tipo: "CLASE" | "COMBO";
  nombre: string;
  descripcion: string | null;
  color: string;
  imagenUrl: string | null;
  incluye: string[];
  packages: Array<{ id: string; nombre: string; clases: number; precio: number; vigenciaDias: number }>;
};

export function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6 sm:mb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">{eyebrow}</p>
      <h2 className="mt-1 font-display text-4xl leading-none sm:text-5xl">{title}</h2>
      {subtitle ? <p className="mt-2 text-sm text-ink-500">{subtitle}</p> : null}
    </div>
  );
}

/** Degradado con los colores de las disciplinas, para cuando no hay foto. */
export function colorWash(colors: string[]) {
  const [a = "#14b87e", b = "#0ea5e9", c = "#a855f7"] = colors;
  return {
    backgroundImage: `radial-gradient(at 15% 20%, ${a}cc 0, transparent 55%), radial-gradient(at 85% 30%, ${b}bb 0, transparent 50%), radial-gradient(at 50% 95%, ${c}aa 0, transparent 55%), linear-gradient(135deg, #0f1724, #1c2433)`
  };
}

export function Hero({
  name,
  disciplines,
  colors,
  coverUrl,
  fromPrice,
  classesThisWeek,
  reserveHref
}: {
  name: string;
  disciplines: string;
  colors: string[];
  coverUrl: string | null;
  fromPrice: number | null;
  classesThisWeek: number;
  reserveHref: string;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="relative isolate overflow-hidden rounded-[2rem] text-white" style={coverUrl ? undefined : colorWash(colors)}>
        {coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt={name} className="absolute inset-0 -z-10 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
          </>
        ) : null}
        <div className="flex min-h-[26rem] flex-col justify-end p-6 sm:min-h-[30rem] sm:p-10">
          {disciplines ? <p className="text-sm font-medium text-white/80">{disciplines}</p> : null}
          <h1 className="mt-2 font-display text-6xl italic leading-[0.9] sm:text-8xl">{name}</h1>

          <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
            {classesThisWeek ? (
              <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{classesThisWeek} clases esta semana</span>
            ) : null}
            {fromPrice !== null ? (
              <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">Desde {formatCop(fromPrice)}</span>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link
              href={reserveHref}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-ink-950 transition hover:bg-white/90 active:scale-[0.98] ${focusRing}`}
            >
              Reservar clase
              <FiArrowRight className="size-4" />
            </Link>
            {fromPrice !== null ? (
              <a
                href="#planes"
                className={`inline-flex min-h-12 items-center justify-center rounded-full border border-white/40 px-6 text-sm font-semibold text-white transition hover:bg-white/10 ${focusRing}`}
              >
                Ver planes
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Disciplines({ catalog }: { catalog: CatalogItem[] }) {
  if (!catalog.length) return null;
  return (
    <ScrollHint
      className="-mx-4 sm:mx-0"
      scrollerClassName="flex snap-x snap-mandatory scroll-px-4 gap-3 px-4 pb-2 sm:scroll-px-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
    >
      {catalog.map((discipline) => {
        const from = discipline.packages.length ? Math.min(...discipline.packages.map((item) => item.precio)) : null;
        return (
          <article
            key={discipline.id}
            className="relative isolate flex aspect-[4/3] w-[85%] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-3xl p-5 text-white sm:aspect-[4/5] sm:w-auto"
            style={discipline.imagenUrl ? undefined : colorWash([discipline.color, `${discipline.color}`, "#0f1724"])}
          >
            {discipline.imagenUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={discipline.imagenUrl} alt={discipline.nombre} loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              </>
            ) : null}
            {discipline.tipo === "COMBO" ? (
              <span className="mb-auto self-start rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold backdrop-blur">Combo</span>
            ) : null}
            <h3 className="font-display text-4xl italic leading-none">{discipline.nombre}</h3>
            <p className="mt-2 line-clamp-2 text-sm text-white/80">
              {discipline.tipo === "COMBO" && discipline.incluye.length ? discipline.incluye.join(" + ") : discipline.descripcion}
            </p>
            {from !== null ? <p className="mt-3 text-sm font-semibold">Desde {formatCop(from)}</p> : null}
          </article>
        );
      })}
    </ScrollHint>
  );
}

type PublicPost = {
  id: string;
  titulo: string;
  cuerpo: string | null;
  mediaUrl: string | null;
  mediaKind: "IMAGEN" | "VIDEO" | null;
  embed: { provider: string; url: string } | null;
  enlaceVideo: string | null;
  fijado: boolean;
  publicadoEn: string | null;
  discipline: { nombre: string; color: string } | null;
};

export function PostsFeed({ posts }: { posts: PublicPost[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {posts.map((post, index) => (
        <article
          key={post.id}
          className={cn(
            "overflow-hidden rounded-3xl border border-black/[0.06] bg-white",
            index === 0 && posts.length > 2 ? "sm:col-span-2" : ""
          )}
        >
          {post.mediaUrl && post.mediaKind === "IMAGEN" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.mediaUrl} alt={post.titulo} loading="lazy" className="aspect-[4/3] w-full object-cover" />
          ) : post.mediaUrl && post.mediaKind === "VIDEO" ? (
            <video src={post.mediaUrl} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />
          ) : post.embed ? (
            <div className={cn("w-full bg-black", post.embed.provider === "youtube" ? "aspect-video" : "aspect-[9/14]")}>
              <iframe
                src={post.embed.url}
                title={post.titulo}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="h-full w-full"
              />
            </div>
          ) : null}
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              {post.fijado ? <span className="rounded-full bg-ink-950 px-2.5 py-1 text-white">Destacado</span> : null}
              {post.discipline ? (
                <span className="rounded-full px-2.5 py-1" style={{ color: post.discipline.color, backgroundColor: `${post.discipline.color}1a` }}>
                  {post.discipline.nombre}
                </span>
              ) : null}
              {post.publicadoEn ? (
                <span className="text-ink-400">
                  {new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" }).format(new Date(post.publicadoEn))}
                </span>
              ) : null}
            </div>
            <h3 className="mt-3 font-display text-3xl leading-tight">{post.titulo}</h3>
            {post.cuerpo ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-600">{post.cuerpo}</p> : null}
            {post.embed && post.enlaceVideo ? (
              <a href={post.enlaceVideo} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold capitalize underline underline-offset-4">
                Ver en {post.embed.provider}
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function ClosingCta({ name, telefono, reserveHref }: { name: string; telefono: string | null; reserveHref: string }) {
  const whatsapp = studioWhatsappUrl(telefono, `Hola ${name}, quiero información sobre las clases.`);
  return (
    <section className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
      <div className="rounded-[2rem] bg-ink-950 px-6 py-12 text-center text-white sm:py-16">
        <h2 className="font-display text-5xl italic leading-none sm:text-6xl">¿Nos vemos en clase?</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm text-white/70">Aparta tu cupo en segundos. Pagas en el estudio o por transferencia.</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link
            href={reserveHref}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-ink-950 hover:bg-white/90 ${focusRing}`}
          >
            Reservar clase
            <FiArrowRight className="size-4" />
          </Link>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/25 px-6 text-sm font-semibold hover:bg-white/10 ${focusRing}`}
            >
              <FiMessageCircle className="size-4" />
              Escribir por WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
