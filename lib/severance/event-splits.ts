import type { Split } from "@/lib/finance/splits";

const SPLIT_FIELD = /^splits\[(.+)\]$/;

/** Reads the event form's `splits[<memberId>]` percentage inputs. Returns
 *  `null` (= split evenly across the household) when none were submitted,
 *  otherwise the validated list; `error` when they don't add up to 100. */
export function parseEventMemberSplits(formData: FormData): { splits: Split[] | null; error?: string } {
  const splits: Split[] = [];
  for (const [key, value] of formData.entries()) {
    const match = key.match(SPLIT_FIELD);
    if (!match) continue;
    const percentage = Number(value);
    if (Number.isNaN(percentage) || percentage < 0) return { splits: null, error: "Percentages must be 0 or more." };
    splits.push({ household_member_id: match[1], percentage });
  }
  if (splits.length === 0) return { splits: null };
  const total = splits.reduce((sum, s) => sum + s.percentage, 0);
  if (Math.abs(total - 100) > 0.5) return { splits: null, error: `The split must add up to 100% (currently ${total}%).` };
  return { splits: splits.filter((s) => s.percentage > 0) };
}
