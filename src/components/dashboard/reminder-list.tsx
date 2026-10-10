"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { FiCheck, FiMessageCircle } from "react-icons/fi";
import { memberName } from "@/components/dashboard/studio-sales-ui";
import { clientApiFetch } from "@/lib/client-api";
import type { ReminderItem } from "@/lib/studio-reminders";
import { cn } from "@/lib/web-utils";

/**
 * Filas de avisos por WhatsApp (spec 011 R4–R6): el boton abre WhatsApp con el
 * mensaje armado y registra el envio para marcar la fila como "Enviado".
 */
export function ReminderList({ items, empty }: { items: ReminderItem[]; empty: string }) {
  const { data: session } = useSession();
  const [sent, setSent] = useState<Record<string, boolean>>({});

  async function send(item: ReminderItem) {
    window.open(item.href, "_blank", "noopener,noreferrer");
    const key = `${item.tipo}|${item.refKey}`;
    setSent((current) => ({ ...current, [key]: true }));
    const token = session?.user.apiToken;
    if (!token) return;
    await clientApiFetch("/api/studio-reminders/sent", token, {
      method: "POST",
      body: JSON.stringify({ tipo: item.tipo, refKey: item.refKey, memberId: item.member.id })
    }).catch(() => undefined);
  }

  if (!items.length) return <p className="py-4 text-center text-xs text-ink-400">{empty}</p>;

  return (
    <ul className="divide-y divide-ink-100">
      {items.map((item) => {
        const done = Boolean(item.enviadoAt) || sent[`${item.tipo}|${item.refKey}`];
        return (
          <li key={`${item.tipo}|${item.refKey}`} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-800">{memberName(item.member)}</p>
              <p className="truncate text-xs text-ink-500">{item.detalle}</p>
            </div>
            <button
              type="button"
              onClick={() => send(item)}
              title={item.mensaje}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                done ? "border border-ink-200 text-ink-500 hover:bg-ink-50" : "bg-brand-600 text-white hover:bg-brand-700"
              )}
            >
              {done ? <FiCheck className="size-3.5" /> : <FiMessageCircle className="size-3.5" />}
              {done ? "Enviado" : "WhatsApp"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
