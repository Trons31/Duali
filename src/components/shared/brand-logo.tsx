import { cn } from "@/lib/web-utils";

// Logo de Duali (spec 016): las letras DU, sin fondo. Vectorial para verse
// nitido en cualquier tamano; los colores son los del logo original.
export const BRAND_COLORS = { d: "#22d3ee", u: "#14b8a6" } as const;

/**
 * Ocupa un cuadrado de `size` (como un icono) con las letras centradas, asi
 * reemplaza al logo anterior sin mover el diseno.
 */
export function BrandLogo({
  size = 40,
  className
}: {
  size?: number;
  className?: string;
  /** Se acepta por compatibilidad: el SVG va en linea y no se carga aparte. */
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg role="img" aria-label="Duali" viewBox="0 0 89 50" width={size} height={(size * 50) / 89}>
        <path d="M0 0H15A25 25 0 0 1 15 50H0Z" fill={BRAND_COLORS.d} />
        <path d="M53 6V28A15 15 0 0 0 83 28V6" fill="none" stroke={BRAND_COLORS.u} strokeWidth="12" strokeLinecap="round" />
      </svg>
    </span>
  );
}
