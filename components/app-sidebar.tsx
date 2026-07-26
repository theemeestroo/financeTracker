"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  Users,
  TrendingDown,
  Home,
  Layers,
  PlaneTakeoff,
  LogOut,
  Menu,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { logout } from "@/lib/actions/auth";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/commitments", label: "Commitments", icon: Receipt },
  { href: "/properties", label: "Properties", icon: Home },
  { href: "/income", label: "Income", icon: Wallet },
  { href: "/household", label: "Household", icon: Users },
  { href: "/profiles", label: "Living Profiles", icon: Layers },
  { href: "/severance-scenarios", label: "Severance Scenarios", icon: TrendingDown },
];

function isItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Two-letter avatar fallback derived from the local part of the sign-in email. */
function initialsFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_+]/).filter(Boolean);
  const letters =
    parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : local.slice(0, 2);
  return (letters || "?").toUpperCase();
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <PlaneTakeoff className="size-4.5" />
      </span>
      <span className="text-base font-semibold tracking-tight">Runaway</span>
    </Link>
  );
}

/**
 * The active route renders as a solid-ink pill (icon + label); the remaining
 * four routes render as a 2x2 grid of bordered off-white tiles. Which four
 * appear in the grid changes as `pathname` changes.
 */
function NavGrid({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const active = NAV_ITEMS.find((item) => isItemActive(pathname, item.href)) ?? NAV_ITEMS[0];
  const rest = NAV_ITEMS.filter((item) => item.href !== active.href);

  return (
    <nav aria-label="Main" className="flex flex-col gap-2">
      <Link
        href={active.href}
        onClick={onNavigate}
        aria-current="page"
        className="flex w-full items-center gap-2.5 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
      >
        <active.icon className="size-4" />
        {active.label}
      </Link>
      <div className="grid grid-cols-2 gap-2">
        {rest.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-secondary px-2 py-3.5 text-center text-xs font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            <item.icon className="size-4" />
            <span className="leading-tight">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function SidebarBody({ pathname, userEmail, onNavigate }: { pathname: string; userEmail: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6">
      <Logo />

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary px-3 py-2.5">
        <Avatar size="sm">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {initialsFromEmail(userEmail)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={userEmail}>
          {userEmail}
        </span>
      </div>

      <NavGrid pathname={pathname} onNavigate={onNavigate} />

      <form action={logout} className="mt-auto">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AppSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile: compact top bar with a drawer for the full nav. */}
      <div className="flex items-center justify-between md:hidden">
        <Logo />
        <Sheet>
          <SheetTrigger
            render={<Button variant="outline" size="icon-sm" aria-label="Open navigation" />}
          >
            <Menu className="size-4" />
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 gap-0 rounded-r-[2rem] border-r-0 bg-sidebar p-5"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>App navigation and account.</SheetDescription>
            </SheetHeader>
            <SidebarBody pathname={pathname} userEmail={userEmail} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: floating white sidebar panel. */}
      <aside className="hidden w-full shrink-0 rounded-[2rem] bg-sidebar p-5 md:flex md:w-[272px] md:flex-col">
        <SidebarBody pathname={pathname} userEmail={userEmail} />
      </aside>
    </>
  );
}
