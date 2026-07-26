"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/ui/native-select";
import { COMMITMENT_CATEGORIES, type HouseholdMember } from "@/lib/types";

export function CommitmentFilters({ members }: { members: HouseholdMember[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const activeOwner = searchParams.get("owner") ?? "all";
  const ownerTabs = [
    { value: "all", label: "All" },
    { value: "household", label: "Household" },
    { value: "non-household", label: "Non household" },
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Filter by who it's linked to"
        className="flex flex-wrap gap-1 rounded-full border border-border bg-secondary p-1"
      >
        {ownerTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeOwner === tab.value}
            onClick={() => setParam("owner", tab.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              activeOwner === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <NativeSelect
        aria-label="Filter by category"
        className="w-auto"
        defaultValue={searchParams.get("category") ?? "all"}
        onChange={(e) => setParam("category", e.target.value)}
      >
        <option value="all">All categories</option>
        {COMMITMENT_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
