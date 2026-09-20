"use client";

import * as React from "react";
import { ConnectionErrorView } from "@/components/shared/connection-error-view";
import { isOfflineDigest } from "@/lib/db-errors";

export default function DashboardError({
  error,
  retry
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const offline = isOfflineDigest(error);

  React.useEffect(() => {
    if (!offline) console.error(error);
  }, [error, offline]);

  return (
    <ConnectionErrorView
      onRetry={retry}
      variant={offline ? "offline" : "generic"}
    />
  );
}
