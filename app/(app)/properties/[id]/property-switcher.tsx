"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import type { Property } from "@/lib/types";

/** Replaces the page's <h1> with a switcher so you can jump straight to another property. */
export function PropertySwitcher({
  properties,
  currentId,
}: {
  properties: Property[];
  currentId: string;
}) {
  const router = useRouter();

  return (
    <div className="relative inline-flex items-center">
      <NativeSelect
        aria-label="Switch property"
        value={currentId}
        onChange={(e) => router.push(`/properties/${e.target.value}`)}
        className="h-auto w-auto appearance-none rounded-none border-none bg-transparent p-0 pr-6 text-2xl font-bold tracking-tight text-foreground focus-visible:ring-0"
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      <ChevronDown className="pointer-events-none absolute right-0 size-4 text-muted-foreground" />
    </div>
  );
}
