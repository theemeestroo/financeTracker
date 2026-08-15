import type { LucideIcon } from "lucide-react";

/** Small icon chip used before a CardTitle's uppercase label — the same
 *  accent language as the scenario page's StatTile, at section-header scale. */
export function TitleIcon({ icon: Icon, accent }: { icon: LucideIcon; accent: string }) {
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: `color-mix(in oklch, ${accent} 20%, transparent)`, color: accent }}
    >
      <Icon className="size-3" />
    </span>
  );
}
