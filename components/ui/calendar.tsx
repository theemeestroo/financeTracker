"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayPickerProps } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const currentYear = new Date().getFullYear()

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  // The library's own default for captionLayout="dropdown" caps the year
  // dropdown at the end of the current year — too narrow for this app's
  // forward-looking dates (severance start, phase changes). Widened to a
  // century back (birthdates) through two decades forward (planning
  // horizon), still overridable per call site.
  startMonth = new Date(currentYear - 100, 0),
  endMonth = new Date(currentYear + 20, 11),
  ...props
}: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      startMonth={startMonth}
      endMonth={endMonth}
      className={cn("p-1", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "flex flex-col gap-3",
        month_caption: "flex items-center justify-center gap-2 pt-1 pb-2",
        caption_label: "flex items-center gap-1 text-sm font-semibold tracking-tight",
        dropdowns: "flex items-center gap-1.5",
        dropdown_root:
          "relative flex h-7 items-center gap-1 rounded-full border border-input px-2.5 text-xs font-semibold hover:bg-muted/50 has-focus:border-ring has-focus:ring-3 has-focus:ring-ring/50",
        dropdown: "absolute inset-0 z-10 appearance-none cursor-pointer bg-transparent opacity-0",
        months_dropdown: "min-w-0",
        years_dropdown: "min-w-0",
        nav: "flex items-center justify-between absolute inset-x-1 top-1",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "text-muted-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "text-muted-foreground"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "size-8 flex items-center justify-center text-xs font-medium text-muted-foreground",
        weeks: "flex flex-col gap-0.5",
        week: "flex",
        day: "size-8 flex items-center justify-center p-0 text-sm",
        day_button:
          "size-8 rounded-full font-normal transition-colors hover:bg-muted/50 aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary/80",
        today: "[&_button]:font-semibold [&_button]:text-foreground",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/40 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) => {
          if (orientation === "left") return <ChevronLeft className="size-4" />
          if (orientation === "down")
            return <ChevronDown className={cn("size-3.5", chevronClassName)} />
          return <ChevronRight className="size-4" />
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
