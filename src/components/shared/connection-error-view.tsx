"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type ConnectionErrorViewProps = {
  onRetry: () => void;
  /** Cuando el error no es de conexion mostramos un texto generico. */
  variant?: "offline" | "generic";
  /** `global-error` se renderiza fuera del layout: necesita ocupar toda la pantalla. */
  fullScreen?: boolean;
};

export function ConnectionErrorView({
  onRetry,
  variant = "offline",
  fullScreen = false
}: ConnectionErrorViewProps) {
  const [retrying, setRetrying] = React.useState(false);

  const retry = React.useCallback(() => {
    setRetrying(true);
    onRetry();
    // Si el reintento falla, el boundary vuelve a montar este componente y el
    // estado se reinicia solo. Este timeout solo evita que el boton quede
    // bloqueado cuando el re-render no ocurre.
    setTimeout(() => setRetrying(false), 4000);
  }, [onRetry]);

  // Reintentar automaticamente en cuanto vuelva el internet del dispositivo.
  React.useEffect(() => {
    if (variant !== "offline") return;
    const onBack = () => onRetry();
    window.addEventListener("online", onBack);
    return () => window.removeEventListener("online", onBack);
  }, [onRetry, variant]);

  const isOffline = variant === "offline";
  const title = isOffline ? "Sin conexión a internet" : "Algo salió mal";
  const description = isOffline
    ? "Revisa tu wifi o tus datos móviles e inténtalo de nuevo."
    : "No pudimos cargar esta sección. Inténtalo de nuevo.";

  return (
    <div
      className={
        fullScreen
          ? "flex min-h-screen items-center justify-center bg-mesh-brand px-4 py-10"
          : "flex min-h-[60vh] items-center justify-center px-1 py-6"
      }
    >
      <div className="shell-card w-full max-w-md px-6 py-10 text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-brand-100">
          <CloudOffIcon className="size-8 text-brand-700" />
        </div>

        <h1 className="text-xl font-bold text-ink-950">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">{description}</p>

        <div className="mt-7 flex flex-col gap-2">
          <Button onClick={retry} loading={retrying}>
            Reintentar
          </Button>
        </div>
      </div>
    </div>
  );
}

function CloudOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M7.5 18a4.5 4.5 0 0 1-.7-8.95" />
      <path d="M9.5 5.5A6 6 0 0 1 18 10.5a3.75 3.75 0 0 1 2.4 6.2" />
      <path d="M17 18H7.5" />
    </svg>
  );
}
