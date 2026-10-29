import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_0_oklch(1_0_0/24%)_inset,0_8px_22px_-12px_oklch(0.82_0.13_78/60%)] hover:bg-[oklch(0.86_0.12_80)]",
        secondary:
          "border border-[var(--line)] bg-[var(--surface-muted)] text-foreground hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)]",
        outline:
          "border border-[var(--line-strong)] bg-transparent text-foreground hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]",
        ghost:
          "text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[oklch(0.66_0.19_25)]",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 gap-1.5 rounded-md px-2.5 text-xs",
        lg: "h-11 rounded-[10px] px-5 text-sm",
        icon: "size-9",
        "icon-sm": "size-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
