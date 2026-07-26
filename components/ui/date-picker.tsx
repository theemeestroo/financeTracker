"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function DatePicker({
  id,
  name,
  defaultValue,
  className,
  placeholder = "Select date",
  disabled,
}: {
  id?: string
  name: string
  /** ISO `YYYY-MM-DD`, or null/undefined for no value. */
  defaultValue?: string | null
  className?: string
  placeholder?: string
  disabled?: boolean
}) {
  const [value, setValue] = React.useState<string | undefined>(defaultValue ?? undefined)
  const [open, setOpen] = React.useState(false)
  const selected = value ? parseISO(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The wire format to the server action stays ISO YYYY-MM-DD — only
       *  the on-screen picker/display changes. */}
      <input type="hidden" name={name} value={value ?? ""} />
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-left transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className={cn("tabular-nums", !value && "text-muted-foreground")}>
          {selected ? format(selected, "dd/MM/yyyy") : placeholder}
        </span>
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            setValue(date ? format(date, "yyyy-MM-dd") : undefined)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
