"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { LivingProfile } from "@/lib/types";

const MAX_SELECTION = 4;

export function ProfilePicker({ profiles }: { profiles: LivingProfile[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < MAX_SELECTION
          ? [...prev, id]
          : prev
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {profiles.map((p) => (
          <label
            key={p.id}
            className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm has-checked:border-foreground"
          >
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={() => toggle(p.id)}
              disabled={!selected.includes(p.id) && selected.length >= MAX_SELECTION}
              className="size-4 rounded border-input accent-foreground"
            />
            {p.name}
            {p.is_baseline ? " (baseline)" : ""}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Pick 2–{MAX_SELECTION} profiles to compare side by side.
      </p>
      <Button
        size="sm"
        disabled={selected.length < 2}
        className="self-start"
        onClick={() => router.push(`/profiles/compare?ids=${selected.join(",")}`)}
      >
        Compare {selected.length > 0 ? `(${selected.length})` : ""}
      </Button>
    </div>
  );
}
