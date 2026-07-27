"use client"

import * as React from "react"
import { format, isValid, parse, parseISO } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const DISPLAY_FORMAT = "dd/MM/yyyy"

function DatePicker({
  id,
  name,
  defaultValue,
  className,
  placeholder = "dd/mm/yyyy",
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
  const [text, setText] = React.useState(() =>
    value ? format(parseISO(value), DISPLAY_FORMAT) : ""
  )
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The wire format to the server action stays ISO YYYY-MM-DD — only
       *  the on-screen picker/display changes. */}
      <input type="hidden" name={name} value={value ?? ""} />
      <div
        className={cn(
          "flex h-8 items-center rounded-lg border border-input bg-transparent pr-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          disabled && "pointer-events-none opacity-50",
          className
        )}
      >
        <Input
          id={id}
          disabled={disabled}
          value={text}
          onChange={(e) => {
            const raw = e.target.value
            setText(raw)
            // Commit as soon as it parses to a real date — lets typing just
            // the year (or any other segment) take effect immediately
            // rather than waiting for blur.
            const trimmed = raw.trim()
            if (trimmed === "") {
              setValue(undefined)
              return
            }
            const parsed = parse(trimmed, DISPLAY_FORMAT, new Date())
            if (isValid(parsed)) setValue(format(parsed, "yyyy-MM-dd"))
          }}
          onBlur={() => {
            // Snap the visible text back to the last successfully committed
            // date — clears anything left unparseable instead of quietly
            // submitting it.
            setText(value ? format(parseISO(value), DISPLAY_FORMAT) : "")
          }}
          placeholder={placeholder}
          className="h-full flex-1 border-0 bg-transparent px-2.5 tabular-nums focus-visible:ring-0"
        />
        <PopoverTrigger
          type="button"
          disabled={disabled}
          aria-label="Open calendar"
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <CalendarIcon className="size-4" />
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto">
        <Calendar
          mode="single"
          selected={value ? parseISO(value) : undefined}
          defaultMonth={value ? parseISO(value) : undefined}
          onSelect={(date) => {
            setValue(date ? format(date, "yyyy-MM-dd") : undefined)
            setText(date ? format(date, DISPLAY_FORMAT) : "")
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
