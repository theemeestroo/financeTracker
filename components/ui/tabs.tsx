"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-5", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative inline-flex items-center gap-1 self-start rounded-full bg-muted p-1",
        className
      )}
      {...props}
    />
  )
}

function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(
        "gradient-brand absolute top-0 left-0 z-0 rounded-full transition-all duration-300 ease-out",
        className
      )}
      style={{
        width: "var(--active-tab-width)",
        height: "var(--active-tab-height)",
        transform: "translate3d(var(--active-tab-left), var(--active-tab-top), 0)",
      }}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "relative z-10 flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold text-muted-foreground outline-none transition-colors data-active:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("flex flex-col gap-6 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsIndicator, TabsTab, TabsPanel }
