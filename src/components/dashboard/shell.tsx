"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { FiLogOut, FiMenu, FiX } from "react-icons/fi";
import { navSections } from "@/components/dashboard/nav-items";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { clientApiFetch } from "@/lib/client-api";
import { cn } from "@/lib/web-utils";

type HeaderAlert = {
  label: string;
  tone: "success" | "warning" | "danger" | "info";
};

export function DashboardShell({
  user,
  alerts,
  children
}: {
  user: {
    name?: string | null;
    email?: string | null;
    businessName: string;
  };
  alerts: HeaderAlert[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const flatItems = useMemo(() => navSections.flatMap((section) => section.items), []);

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

  const sidebarHeader = (
    <div className="shrink-0 px-5 pb-5 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo size={46} priority />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">Duali</p>
            <h2 className="truncate text-lg font-extrabold text-ink-950">{user.businessName}</h2>
            <p className="truncate text-xs text-ink-500">{user.name ?? "Administrador"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="hidden shrink-0 justify-center px-3 sm:inline-flex"
            onClick={handleLogout}
          >
            <FiLogOut className="size-4" />
            <span>Cerrar sesion</span>
          </Button>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full bg-ink-100 p-2 text-ink-700 xl:hidden"
            aria-label="Cerrar menu"
          >
            <FiX className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );

  const desktopSidebarHeader = (
    <div className="shrink-0 px-5 pb-5 pt-5">
      <div className="flex items-center gap-3">
        <BrandLogo size={46} priority />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">Duali</p>
          <h2 className="truncate text-lg font-extrabold text-ink-950">{user.businessName}</h2>
        </div>
      </div>
    </div>
  );

  const navContent = (
    <>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.26em] text-ink-400">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition",
                      active
                        ? "bg-brand-600 text-white shadow-soft"
                        : "text-ink-600 hover:bg-brand-50 hover:text-brand-700"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-ink-100 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
        <div className="rounded-3xl bg-cream px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo size={38} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-950">{user.name ?? "Administrador"}</p>
                <p className="truncate text-xs text-ink-500">{user.email}</p>
              </div>
            </div>

            <Button type="button" variant="ghost" className="shrink-0 justify-center px-3 sm:hidden" onClick={handleLogout}>
              <FiLogOut className="size-4" />
              <span>Cerrar sesion</span>
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-80 border-r border-ink-100 bg-white xl:block">
        <div className="flex h-full flex-col">
          {desktopSidebarHeader}
          {navContent}
        </div>
      </aside>

      <div className="xl:pl-80">
        <header className="sticky top-0 z-30 border-b border-ink-100 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-2xl border border-ink-200 bg-white p-3 text-ink-700 xl:hidden"
              >
                <FiMenu className="size-5" />
              </button>

              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  {alerts.map((alert) => (
                    <span
                      key={alert.label}
                      className={cn(
                        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold",
                        alert.tone === "danger" && "border-rose-200 bg-rose-50 text-rose-700",
                        alert.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
                        alert.tone === "info" && "border-sky-200 bg-sky-50 text-sky-700",
                        alert.tone === "success" && "border-brand-200 bg-brand-50 text-brand-700"
                      )}
                    >
                      {alert.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm sm:flex">
              <BrandLogo size={34} />
              <div className="text-right">
                <p className="text-sm font-bold text-ink-950">{user.businessName}</p>
                <p className="text-xs text-ink-500">{user.name}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 xl:hidden">
        <div className="grid grid-cols-4 gap-2">
          {flatItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold",
                  active ? "bg-brand-600 text-white" : "text-ink-500"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 bg-ink-950/40 xl:hidden" onClick={() => setOpen(false)}>
          <div
            className="flex h-dvh w-[86vw] max-w-sm flex-col overflow-hidden bg-white shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            {sidebarHeader}
            {navContent}
          </div>
        </div>
      ) : null}
    </div>
  );
}
