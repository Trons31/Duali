"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function ConfirmDialog({
  open,
  title,
  description,
  notice,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
  noticeTone,
  loading = false,
  onClose,
  onConfirm,
  confirmDisabled = false,
  children
}: {
  open: boolean;
  title: string;
  description: string;
  notice?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger";
  noticeTone?: "info" | "success" | "danger";
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  /** Contenido propio bajo el aviso (p. ej. una casilla o el motivo). */
  children?: React.ReactNode;
}) {
  const resolvedNoticeTone = noticeTone ?? (variant === "danger" ? "danger" : "success");

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
            {cancelText}
          </Button>
          <Button type="button" variant={variant} className="w-full sm:w-auto" onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmText}
          </Button>
        </div>
      }
    >
      {notice ? (
        <div
          className={
            resolvedNoticeTone === "danger"
              ? "rounded-3xl bg-rose-50 px-4 py-4 text-sm text-rose-700"
              : resolvedNoticeTone === "success"
                ? "rounded-3xl bg-brand-50 px-4 py-4 text-sm text-brand-700"
                : "rounded-3xl bg-ink-50 px-4 py-4 text-sm text-ink-600"
          }
        >
          {notice}
        </div>
      ) : null}
      {children ? <div className={notice ? "mt-4" : undefined}>{children}</div> : null}
    </Modal>
  );
}
