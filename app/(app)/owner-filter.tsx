"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { HouseholdMember } from "@/lib/types";

export function OwnerFilter({ members }: { members: HouseholdMember[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setOwner(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("owner");
    } else {
      params.set("owner", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const active = searchParams.get("owner") ?? "all";
  const tabs = [
    { value: "all", label: "Whole household" },
    { value: "household", label: "Unattributed" },
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div
      role="tablist"
      aria-label="Filter category breakdown by owner"
      className="flex flex-wrap gap-1 rounded-full border border-border bg-secondary p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => setOwner(tab.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
            active === tab.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
