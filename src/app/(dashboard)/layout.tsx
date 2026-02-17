"use client";

import Link from "next/link";
import { Brain, ClipboardPaste, Flame, Settings } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { NavLink } from "@/components/nav-link";

const navItems = [
  { href: "/memories", label: "Embers", icon: Brain },
  { href: "/capture", label: "Gather", icon: ClipboardPaste },
  { href: "/wake", label: "Kindle", icon: Flame },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-ember-border-subtle md:bg-ember-surface">
        <div className="flex h-16 items-center px-6">
          <Link
            href="/memories"
            className="flex items-center gap-2 font-display text-xl font-bold text-ember-amber"
          >
            <span className="inline-block h-6 w-6 animate-pulse rounded-full bg-ember-amber/20 shadow-ember-glow-sm" />
            Ember
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              variant="sidebar"
            />
          ))}
        </nav>
        <div className="border-t border-ember-border-subtle p-4">
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-ember-border-subtle bg-ember-surface/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex h-16 items-center justify-around px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              variant="mobile"
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
