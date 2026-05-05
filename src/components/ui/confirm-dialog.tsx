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
  onConfirm
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
}) {
  const resolvedNoticeTone = noticeTone ?? (variant === "danger" ? "danger" : "success");

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <Button type="button" variant={variant} onClick={onConfirm} loading={loading}>
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
    </Modal>
  );
}
