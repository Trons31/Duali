"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { FiLogOut, FiMenu, FiX, FiZap } from "react-icons/fi";
import { navSections } from "@/components/dashboard/nav-items";
import { BrandLogo } from "@/components/shared/brand-logo";
import { clientApiFetch } from "@/lib/client-api";
import { cn } from "@/lib/web-utils";

type HeaderAlert = {
  label: string;
  tone: "success" | "warning" | "danger" | "info";
};

export function DashboardShell({
  user,
  planDays,
  planStatus,
  alerts,
  children
}: {
  user: {
    name?: string | null;
    email?: string | null;
    businessName: string;
  };
  planDays: number;
  planStatus: string;
  alerts: HeaderAlert[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [activeAlertIndex, setActiveAlertIndex] = useState(0);
  const isPlanOverdue = planDays < 0 || planStatus === "VENCIDA";
  const visiblePlanDays = Math.max(planDays, 0);

  useEffect(() => {
    setActiveAlertIndex(0);
  }, [alerts]);

  useEffect(() => {
    if (alerts.length <= 1) return;

    const interval = window.setInterval(() => {
      setActiveAlertIndex((current) => (current + 1) % alerts.length);
    }, 4200);

    return () => window.clearInterval(interval);
  }, [alerts.length]);

  useEffect(() => {
    if (!open) return;

    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [open]);

  async function handleLogout() {
    const token = session?.user?.apiToken;

    if (token && typeof window !== "undefined" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription?.endpoint) {
          await clientApiFetch("/api/notifications/web-push", token, {
            method: "DELETE",
            body: JSON.stringify({ endpoint: subscription.endpoint })
          }).catch(() => undefined);

          await subscription.unsubscribe().catch(() => undefined);
        }
      } catch {
        // no-op
      }
    }

    await signOut({ redirect: false });
    router.push("/auth/login");
    router.refresh();
  }

  const navContent = (
    <div className="relative flex h-full flex-col overflow-hidden bg-white text-ink-950">
      <div className="relative px-2 pb-3 pt-2">
        <div className="rounded-2xl border border-ink-100 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <BrandLogo size={44} priority className="rounded-2xl shadow-none" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black leading-tight text-ink-950">{user.businessName}</p>
              <p className="mt-1 truncate text-xs font-medium leading-tight text-ink-500">Academia</p>
              <p className="mt-0.5 truncate text-xs leading-tight text-ink-400">{user.name ?? "Administrador"}</p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl p-2 text-ink-500 hover:bg-ink-50 xl:hidden"
              aria-label="Cerrar menu"
            >
              <FiX className="size-5" />
            </button>
          </div>

          <Link
            href="/dashboard/mi-plan"
            onClick={() => setOpen(false)}
            className={cn(
              "mt-3 flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-xs font-bold shadow-sm transition hover:opacity-90",
              isPlanOverdue
                ? "border-rose-100 bg-rose-50 text-rose-700"
                : visiblePlanDays <= 3
                  ? "border-amber-100 bg-amber-50 text-amber-700"
                  : "border-brand-100 bg-brand-50 text-brand-700"
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <FiZap className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate uppercase">Plan</span>
              <span className="block truncate font-semibold">
                {isPlanOverdue ? "Vencido" : `${visiblePlanDays} dia${visiblePlanDays === 1 ? "" : "s"} restantes`}
              </span>
            </span>
          </Link>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {navSections.map((section) => (
          <div key={section.title} className="mt-4 border-t border-ink-100 pt-4 first:mt-1 first:border-t-0 first:pt-0">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group relative flex min-h-9 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition",
                      active ? "bg-brand-600 text-white shadow-sm" : "text-ink-600 hover:bg-ink-50 hover:text-ink-950"
                    )}
                  >
                    {active ? (
                      <span className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-300" />
                    ) : null}
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-white" : "text-ink-400 group-hover:text-brand-600"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative px-2 pb-3">
        <div className="overflow-hidden rounded-xl border border-ink-100 bg-white shadow-sm">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-ink-600 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <FiLogOut className="size-4 text-brand-600" />
            <span className="min-w-0 flex-1 truncate">Cerrar sesion</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-ink-100 bg-white xl:block">
        {navContent}
      </aside>

      <div className="xl:pl-64">
        <header className="sticky top-0 z-30 border-b border-ink-100 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex min-w-0 items-center gap-2 xl:hidden">
                  <BrandLogo size={34} priority className="rounded-xl shadow-none" />
                  <p className="truncate text-sm font-bold text-ink-950">{user.businessName}</p>
                </div>

                <div className="hidden min-w-0 xl:block">
                  <HeaderAlertRotator alerts={alerts} activeIndex={activeAlertIndex} />
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <PlanDaysPill days={visiblePlanDays} overdue={isPlanOverdue} />

                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="rounded-xl p-2 text-ink-700 hover:bg-ink-50 xl:hidden"
                  aria-label="Abrir menu"
                >
                  <FiMenu className="size-5" />
                </button>
              </div>

              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold text-ink-950">{user.businessName}</p>
                <p className="text-xs text-ink-500">{user.name}</p>
              </div>
            </div>

            <div className="mt-2 xl:hidden">
              <div className="flex justify-center">
                <HeaderAlertRotator alerts={alerts} activeIndex={activeAlertIndex} />
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl bg-[#f8fafc] px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-ink-950/40 xl:hidden" onClick={() => setOpen(false)}>
          <div
            className="h-dvh w-[82vw] max-w-64 overflow-hidden bg-white shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            {navContent}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlanDaysPill({ days, overdue }: { days: number; overdue: boolean }) {
  return (
    <Link
      href="/dashboard/mi-plan"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black leading-none shadow-sm",
        overdue ? "bg-rose-50 text-rose-700" : days <= 3 ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"
      )}
      aria-label={overdue ? "Plan vencido" : `Quedan ${days} dias del plan`}
    >
      <FiZap className="size-3.5" />
      <span>{overdue ? "Plan 0d" : `Plan ${days}d`}</span>
    </Link>
  );
}

function HeaderAlertRotator({
  alerts,
  activeIndex
}: {
  alerts: HeaderAlert[];
  activeIndex: number;
}) {
  const alert = alerts[activeIndex] ?? alerts[0];

  if (!alert) return null;

  return (
    <div className="min-h-7 max-w-[min(68vw,22rem)] overflow-hidden" aria-live="polite">
      <span
        key={alert.label}
        className={cn(
          "inline-flex max-w-full animate-[alert-fade_4200ms_ease-in-out_infinite] items-center truncate rounded-full border px-3 py-1 text-[11px] font-bold",
          alert.tone === "danger" && "border-rose-200 bg-rose-50 text-rose-700",
          alert.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
          alert.tone === "info" && "border-sky-200 bg-sky-50 text-sky-700",
          alert.tone === "success" && "border-brand-200 bg-brand-50 text-brand-700"
        )}
      >
        {alert.label}
      </span>
    </div>
  );
}
