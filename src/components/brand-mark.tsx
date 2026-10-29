import { useId } from "react";

import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  const gradientId = `brand-${useId().replace(/:/g, "")}`;

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-deep)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)]",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_8%,rgba(232,182,102,0.18),transparent_62%)]" />
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        fill="none"
        className="relative size-[70%]"
      >
        <defs>
          <linearGradient id={gradientId} x1="10" y1="7" x2="22" y2="27">
            <stop offset="0" stopColor="#f6d99e" />
            <stop offset="0.55" stopColor="#e8b666" />
            <stop offset="1" stopColor="#c58a3c" />
          </linearGradient>
        </defs>
        <path
          d="M10.5 8v16M10.5 15.4c0 4.6 11 3.6 11 8.6"
          stroke={`url(#${gradientId})`}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle
          cx="10.5"
          cy="7.5"
          r="2.7"
          fill={`url(#${gradientId})`}
          stroke="#0b0d10"
          strokeWidth="1.1"
        />
        <circle
          cx="10.5"
          cy="24.8"
          r="2.7"
          fill={`url(#${gradientId})`}
          stroke="#0b0d10"
          strokeWidth="1.1"
        />
        <circle
          cx="21.7"
          cy="24.8"
          r="2.7"
          fill={`url(#${gradientId})`}
          stroke="#0b0d10"
          strokeWidth="1.1"
        />
      </svg>
    </div>
  );
}
