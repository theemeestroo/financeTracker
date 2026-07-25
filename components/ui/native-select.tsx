import * as React from "react";
import { cn } from "@/lib/utils";

// A plain native <select>, styled to match shadcn's Input. Used instead of
// the Base UI Select in forms submitted as native FormData (Server Actions)
// since it doesn't need a `name` prop wired through client state.
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  );
}

export { NativeSelect };
