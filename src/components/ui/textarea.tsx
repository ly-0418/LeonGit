import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[88px] w-full resize-none rounded-lg border border-[var(--line-strong)] bg-[var(--well)] px-3 py-2 text-[12px] leading-relaxed text-foreground outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/35 focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
