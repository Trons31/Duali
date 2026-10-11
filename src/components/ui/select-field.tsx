"use client";

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import type { IconType } from "react-icons";
import { FiChevronDown } from "react-icons/fi";
import { cn } from "@/lib/web-utils";

/**
 * El select del panel (como "Ordenar por" y el filtro de grupos en Alumnos):
 * sin la flecha del navegador, con la nuestra y un ícono opcional a la
 * izquierda. Sigue siendo un <select> nativo: en el celular abre el selector
 * del sistema y funciona con teclado y lectores de pantalla.
 */
export const SelectField = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { icon?: IconType; wrapperClassName?: string; children: ReactNode }
>(function SelectField({ icon: Icon, className, wrapperClassName, children, ...props }, ref) {
  return (
    <span className={cn("relative block", wrapperClassName)}>
      {Icon ? <Icon className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-brand-600" aria-hidden /> : null}
      <select
        ref={ref}
        {...props}
        className={cn(
          "h-11 w-full cursor-pointer appearance-none rounded-xl border border-ink-200 bg-white pr-10 text-sm font-semibold text-ink-800 outline-none transition hover:border-ink-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60",
          Icon ? "pl-10" : "pl-3.5",
          className
        )}
      >
        {children}
      </select>
      <FiChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
    </span>
  );
});
