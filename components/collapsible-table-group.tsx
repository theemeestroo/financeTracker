"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** A collapsible section within a table — starts rolled up; click the row
 *  (or its chevron) to expand. The label, if linked, stays a separate
 *  click target so it navigates instead of toggling.
 *
 *  `colSpan` must equal the table's total column count minus 2 (one cell
 *  for the trailing total, one for the actions column). */
export function CollapsibleTableGroup({
  label,
  href,
  total,
  colSpan,
  children,
}: {
  label: string;
  href?: string;
  total: string;
  colSpan: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <TableBody>
      <TableRow
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="cursor-pointer bg-muted/30 select-none hover:bg-muted/40"
      >
        <TableCell colSpan={colSpan} className="font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90"
              )}
              aria-hidden
            />
            {href ? (
              <Link
                href={href}
                onClick={(e) => e.stopPropagation()}
                className="hover:underline underline-offset-2"
              >
                {label}
              </Link>
            ) : (
              label
            )}
          </span>
        </TableCell>
        <TableCell className="text-right font-semibold tabular-nums">{total}</TableCell>
        <TableCell />
      </TableRow>
      {open && children}
    </TableBody>
  );
}
