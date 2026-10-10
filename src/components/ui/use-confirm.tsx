"use client";

import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ConfirmOptions = {
  title: string;
  description: string;
  /** Que se pierde y que no (spec 019 R2). */
  notice?: string;
  confirmText?: string;
  variant?: "primary" | "danger";
};

/**
 * Confirmacion antes de borrar (spec 019 R1): `if (!(await confirm({...}))) return;`
 * Hay que pintar `dialog` en el componente que usa el hook.
 */
export function useConfirm() {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    []
  );

  function close(value: boolean) {
    pending?.resolve(value);
    setPending(null);
  }

  const dialog = pending ? (
    <ConfirmDialog
      open
      title={pending.options.title}
      description={pending.options.description}
      notice={pending.options.notice}
      confirmText={pending.options.confirmText ?? "Sí, continuar"}
      variant={pending.options.variant ?? "danger"}
      onClose={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null;

  return { confirm, dialog };
}
