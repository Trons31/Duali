"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sileo } from "sileo";
import { FiPackage } from "react-icons/fi";
import { clientApiFetch } from "@/lib/client-api";
import { cn } from "@/lib/web-utils";

// Piezas compartidas por las pantallas del Modo Estudio (specs 003–007).

export const inputClass =
  "w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-700 placeholder:text-ink-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400";
export const labelClass = "mb-1 block text-xs font-medium text-ink-500";

export function useStudioRequest() {
  const { data: session } = useSession();
  const router = useRouter();

  return async (path: string, init: RequestInit, successTitle: string) => {
    const token = session?.user.apiToken;
    if (!token) return false;

    try {
      await clientApiFetch(path, token, init);
      sileo.success({ title: successTitle });
      router.refresh();
      return true;
    } catch (error) {
      sileo.error({ title: (error as Error).message });
      return false;
    }
  };
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-3 shrink-0 rounded-full", className)} style={{ backgroundColor: color }} />;
}

export function EmptyCard({ title, description, action }: { title: string; description: string; action: ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 text-center shadow-sm sm:p-10">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <FiPackage className="size-5" />
      </div>
      <h2 className="mt-4 font-semibold text-ink-800">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{description}</p>
      <div className="mt-5 flex justify-center">{action}</div>
    </div>
  );
}

export function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-brand-500" : "bg-ink-300")}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}
