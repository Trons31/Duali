"use client";

/**
 * Campo de dinero con puntos de mil.
 *
 * Un `<input type="number">` no puede mostrar separadores: el navegador exige
 * un numero valido y `1.500.000` no lo es. Por eso va como texto con
 * `inputMode="numeric"`, que ademas abre el teclado numerico en movil.
 *
 * Hacia fuera entrega la cadena de digitos sin formato, para que quien lo use
 * haga `Number(value)` como con cualquier input.
 */

import { forwardRef } from "react";
import { cn } from "@/lib/web-utils";
import { formatThousands, onlyDigits } from "@/lib/money-input";

export const MoneyInput = forwardRef<
  HTMLInputElement,
  {
    /** Cadena de digitos sin formato. */
    value: string;
    /** Recibe la cadena de digitos sin formato. */
    onChange: (value: string) => void;
    onBlur?: () => void;
    name?: string;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    "aria-label"?: string;
  }
>(function MoneyInput(
  { value, onChange, onBlur, name, placeholder = "0", className, disabled, "aria-label": ariaLabel },
  ref
) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-400">
        $
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        name={name}
        value={formatThousands(value)}
        onChange={(event) => onChange(onlyDigits(event.target.value))}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn("field-base pl-8", className)}
      />
    </div>
  );
});
