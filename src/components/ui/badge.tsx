import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.01em]",
  {
    variants: {
      variant: {
        default: "border-brand/20 bg-brand/10 text-brand",
        secondary: "border-[var(--line)] bg-[var(--surface-muted)] text-muted-foreground",
        outline: "border-[var(--line-strong)] bg-transparent text-muted-foreground",
        destructive: "border-rose/20 bg-rose/10 text-rose",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
