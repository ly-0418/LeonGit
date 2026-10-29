import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border border-[var(--line-strong)] bg-[var(--well)] px-3 py-1 text-[12.5px] text-foreground outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/35 selection:bg-brand/25 file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/15",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
