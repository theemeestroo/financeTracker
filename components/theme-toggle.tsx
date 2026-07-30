"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const emptySubscribe = () => () => {};

/**
 * True once hydrated on the client; false during SSR and the initial
 * hydration pass. The `getServerSnapshot` argument is the React-sanctioned
 * way to force the one extra render this needs after hydrating, without a
 * `useState`+`useEffect` mounted-guard (which this repo's lint config flags
 * as a cascading-render risk).
 */
function useHydrated() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

/**
 * `row` matches the sidebar's hand-written Help/Sign-out row style
 * (`components/app-sidebar.tsx`); `icon` is a compact icon-only button for
 * the mobile top bar, alongside the nav drawer trigger.
 *
 * Renders the light-mode target (before hydration, and whenever not yet
 * resolved) rather than guessing dark/light — next-themes only knows the
 * resolved theme client-side, so showing anything hydration-dependent
 * before `useHydrated()` flips would risk a mismatch on top of the flash
 * next-themes' own blocking script already prevents for the `<html>` class
 * itself.
 */
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();

  const isDark = hydrated && resolvedTheme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        {isDark ? "Light mode" : "Dark mode"}
      </button>
    );
  }

  return (
    <Button type="button" variant="outline" size="icon-sm" onClick={toggle} aria-label={label}>
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
