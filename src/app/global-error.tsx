"use client";

import { ConnectionErrorView } from "@/components/shared/connection-error-view";
import { isOfflineDigest } from "@/lib/db-errors";
import "@/app/globals.css";

// Ultimo recurso: se usa cuando falla el propio root layout, por eso tiene que
// renderizar <html> y <body> por su cuenta.
export default function GlobalError({
  error,
  retry
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const offline = isOfflineDigest(error);

  return (
    <html lang="es">
      <body>
        <ConnectionErrorView
          onRetry={retry}
          fullScreen
          variant={offline ? "offline" : "generic"}
        />
      </body>
    </html>
  );
}
