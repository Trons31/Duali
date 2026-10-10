"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { FiChevronRight } from "react-icons/fi";
import { cn } from "@/lib/web-utils";

/**
 * Fila con scroll horizontal que avisa cuando hay mas fuera de la vista (como
 * el ScrollableTabs de CliqCut). En el celular la barra de scroll casi no se ve:
 * aqui se pinta un degradado con una flecha en el borde, solo mientras quede algo
 * por ver hacia ese lado. Tocar la flecha avanza; el scroll real sigue siendo el
 * del contenedor, accesible con el dedo y el teclado.
 */
export function ScrollHint({
  children,
  className,
  scrollerClassName,
  fade = "sand",
  ...scrollerProps
}: {
  children: ReactNode;
  /** Del envoltorio: margenes (p. ej. -mx-4 para llegar al borde de la pantalla). */
  className?: string;
  /** Del contenedor que se desplaza: flex, gap, padding... */
  scrollerClassName?: string;
  /** Color del fondo sobre el que va la fila, para fundir el degradado. */
  fade?: "sand" | "white";
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const update = () => {
      // 2px de margen absorben el redondeo a subpixel (si no, la flecha parpadea al final).
      setCanLeft(node.scrollLeft > 2);
      setCanRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 2);
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    // Girar el telefono o cambiar el contenido cambia si sobra o falta espacio.
    const observer = new ResizeObserver(update);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => {
      node.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [children]);

  function step(direction: 1 | -1) {
    const node = scroller.current;
    if (node) node.scrollBy({ left: direction * Math.max(node.clientWidth * 0.7, 120), behavior: "smooth" });
  }

  const gradient = fade === "white" ? "from-white via-white/90" : "from-sand via-sand/90";
  const arrow = fade === "white" ? "text-brand-500" : "text-ink-900";

  return (
    <div className={cn("relative", className)}>
      <div
        ref={scroller}
        {...scrollerProps}
        className={cn("overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", scrollerClassName)}
      >
        {children}
      </div>

      {canLeft ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => step(-1)}
          className={cn("absolute inset-y-0 left-0 flex w-12 items-center justify-start bg-gradient-to-r to-transparent pl-1.5", gradient)}
        >
          <FiChevronRight className={cn("size-5 rotate-180", arrow)} />
        </button>
      ) : null}
      {canRight ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => step(1)}
          className={cn("absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-gradient-to-l to-transparent pr-1.5", gradient)}
        >
          <FiChevronRight className={cn("size-5 animate-pulse motion-reduce:animate-none", arrow)} />
        </button>
      ) : null}
    </div>
  );
}
