"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { FiLogOut, FiMenu, FiX } from "react-icons/fi";
import { useMemo, useState } from "react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { navSections } from "@/components/dashboard/nav-items";
import { cn } from "@/lib/web-utils";

export function DashboardShell({
  user,
  children
}: {
  user: {
    name?: string | null;
    email?: string | null;
    businessName: string;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const flatItems = useMemo(() => navSections.flatMap((section) => section.items), []);

  async function handleLogout() {
    await signOut({ redirect: false });
    router.push("/auth/login");
    router.refresh();
  }

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-6 pt-5">
        <BrandLogo size={46} priority />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">Duali</p>
          <h2 className="text-lg font-extrabold text-ink-950">{user.businessName}</h2>
        </div>
      </div>

      <div className="space-y-6 overflow-y-auto px-4 pb-6">
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

      <div className="mt-auto border-t border-ink-100 px-4 py-4">
        <div className="rounded-3xl bg-cream px-4 py-4">
          <p className="text-sm font-bold text-ink-950">{user.name ?? "Administrador"}</p>
          <p className="mt-1 text-xs text-ink-500">{user.email}</p>
          <Button type="button" variant="ghost" className="mt-4 w-full justify-start" onClick={handleLogout}>
            <FiLogOut className="size-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-80 border-r border-white/60 bg-white/88 backdrop-blur xl:block">
        {nav}
      </aside>

      <div className="xl:pl-80">
        <header className="sticky top-0 z-30 border-b border-white/60 bg-white/75 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-2xl border border-ink-200 bg-white p-3 text-ink-700 xl:hidden"
              >
                <FiMenu className="size-5" />
              </button>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand-700">Panel web</p>
                <p className="text-sm text-ink-500">Versión completa para iPhone, Android y escritorio.</p>
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

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/70 bg-white/92 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur xl:hidden">
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
        <div className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-sm xl:hidden">
          <div className="h-full w-[86vw] max-w-sm bg-white shadow-soft">
            <div className="flex justify-end px-4 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-ink-100 p-2 text-ink-700"
              >
                <FiX className="size-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}
    </div>
  );
}
