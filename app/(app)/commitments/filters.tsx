"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { COMMITMENT_CATEGORIES } from "@/lib/types";

export function CommitmentFilters() {
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

  return (
    <div className="flex gap-2">
      <NativeSelect
        aria-label="Filter by ownership"
        className="w-auto"
        defaultValue={searchParams.get("ownership") ?? "all"}
        onChange={(e) => setParam("ownership", e.target.value)}
      >
        <option value="all">All ownership</option>
        <option value="shared">Shared</option>
        <option value="individual">Individual</option>
      </NativeSelect>
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
