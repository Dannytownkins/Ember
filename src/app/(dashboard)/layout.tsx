import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Brain, ClipboardPaste, Flame, Settings } from "lucide-react";

const navItems = [
  { href: "/memories", label: "Memories", icon: Brain },
  { href: "/capture", label: "Capture", icon: ClipboardPaste },
  { href: "/wake", label: "Wake", icon: Flame },
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
          <Link href="/memories" className="font-display text-xl font-bold text-ember-amber">
            Ember
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ember-text-secondary transition-colors hover:bg-ember-surface-hover hover:text-ember-text"
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-ember-border-subtle p-4">
          <UserButton
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
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-1 text-ember-text-muted transition-colors hover:text-ember-amber"
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
