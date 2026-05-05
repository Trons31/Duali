"use client";

import * as React from "react";
import { cn } from "@/lib/web-utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
};

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-brand-600 text-white shadow-soft hover:bg-brand-700 focus:ring-brand-200 disabled:bg-brand-300",
  secondary:
    "bg-white text-ink-900 border border-ink-200 hover:bg-ink-50 focus:ring-ink-100",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-100 focus:ring-ink-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-200 disabled:bg-rose-300"
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", loading = false, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed",
        variantClasses[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
});
