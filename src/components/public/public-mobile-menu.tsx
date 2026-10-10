"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiMenu, FiX } from "react-icons/fi";
import { focusRing } from "@/components/public/public-shell";

/**
 * Menu colapsable del celular (como el Header de la floristeria): el boton abre
 * un panel bajo la barra con las secciones. Se cierra al elegir una, al tocar
 * fuera o con Escape, y mientras esta abierto el fondo no se desplaza.
 */
export function PublicMobileMenu({ items, reserveHref }: { items: Array<{ id: string; label: string }>; reserveHref: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        aria-controls="menu-secciones"
        className={`flex size-11 items-center justify-center rounded-full border border-black/10 bg-white text-ink-800 transition hover:border-black/20 md:hidden ${focusRing}`}
      >
        {open ? <FiX className="size-5" /> : <FiMenu className="size-5" />}
      </button>

      {open ? (
        <nav
          id="menu-secciones"
          aria-label="Secciones"
          className="absolute inset-x-0 top-full animate-fade-in border-t border-black/[0.06] bg-sand shadow-soft motion-reduce:animate-none md:hidden"
        >
          <div className="flex flex-col px-4 py-3">
            {items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setOpen(false)}
                className="border-b border-black/[0.06] px-3 py-3.5 font-display text-2xl leading-none text-ink-900 active:text-ink-500"
              >
                {item.label}
              </a>
            ))}
            <a
              href={reserveHref}
              className={`mt-3 inline-flex min-h-12 items-center justify-center rounded-full bg-ink-950 text-base font-semibold text-white ${focusRing}`}
            >
              Reservar clase
            </a>
          </div>
        </nav>
      ) : null}

      {/* En body y sobre la barra inferior (z-40); la barra superior (z-50) queda encima. */}
      {open
        ? createPortal(
            <div
              onClick={() => setOpen(false)}
              aria-hidden
              style={{ zIndex: 45 }}
              className="fixed inset-0 animate-fade-in bg-ink-950/40 motion-reduce:animate-none md:hidden"
            />,
            document.body
          )
        : null}
    </>
  );
}
