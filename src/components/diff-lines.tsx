import { GitCompareArrows, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DiffLine } from "@/types/git";

function DiffLineRow({
  line,
  lineIndex,
  selectable,
  selected,
  disabled,
  onToggleLine,
}: {
  line: DiffLine;
  lineIndex: number;
  selectable: boolean;
  selected: boolean;
  disabled: boolean;
  onToggleLine: (index: number) => void;
}) {
  if (line.kind === "hunk") {
    return (
      <div className="flex min-w-full w-max items-center border-y border-brand/10 bg-brand/[0.055] px-3 py-1 font-mono text-[10.5px] text-brand/75">
        {selectable && <span className="w-6 shrink-0" />}
        <span className="whitespace-pre">{line.content}</span>
      </div>
    );
  }

  if (line.kind === "meta") {
    return (
      <div className="flex min-w-full w-max items-center px-3 py-0.5 font-mono text-[10px] leading-[1.6] text-muted-foreground/35">
        {selectable && <span className="w-6 shrink-0" />}
        <span className="whitespace-pre">{line.content || " "}</span>
      </div>
    );
  }

  const isAddition = line.kind === "addition";
  const isDeletion = line.kind === "deletion";
  const prefix = isAddition ? "+" : isDeletion ? "-" : " ";
  const canSelect = selectable && (isAddition || isDeletion);

  return (
    <div
      className={cn(
        "flex min-w-full w-max items-stretch font-mono text-[11.5px] leading-[1.65]",
        isAddition && "bg-jade/[0.065]",
        isDeletion && "bg-rose/[0.07]",
        !isAddition && !isDeletion && "hover:bg-[var(--surface-subtle)]",
        canSelect && selected && "bg-rose/[0.14]",
      )}
    >
      {selectable && (
        <span className="flex w-6 shrink-0 items-center justify-center border-r border-[var(--line-subtle)]">
          {canSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleLine(lineIndex)}
              disabled={disabled}
              aria-label={`选择丢弃第 ${lineIndex + 1} 行`}
              className="size-3 accent-rose-500"
            />
          )}
        </span>
      )}
      <span className="w-11 shrink-0 select-none border-r border-[var(--line-subtle)] px-1 text-right text-[10px] tabular-nums text-muted-foreground/30">
        {line.oldLine ?? ""}
      </span>
      <span className="w-11 shrink-0 select-none border-r border-[var(--line-subtle)] px-1 text-right text-[10px] tabular-nums text-muted-foreground/30">
        {line.newLine ?? ""}
      </span>
      <span
        className={cn(
          "w-5 shrink-0 select-none text-center",
          isAddition && "text-jade/80",
          isDeletion && "text-rose/80",
          !isAddition && !isDeletion && "text-muted-foreground/25",
        )}
      >
        {prefix}
      </span>
      <pre
        className={cn(
          "whitespace-pre pr-8",
          isAddition && "text-jade/90",
          isDeletion && "text-rose/85",
          !isAddition && !isDeletion && "text-foreground/72",
        )}
      >
        {line.content || " "}
      </pre>
    </div>
  );
}

interface DiffLinesProps {
  lines: DiffLine[];
  isBinary?: boolean;
  truncated?: boolean;
  selectable?: boolean;
  selectedLines?: Set<number>;
  onToggleLine?: (index: number) => void;
  disabled?: boolean;
}

export function DiffLines({
  lines,
  isBinary = false,
  truncated = false,
  selectable = false,
  selectedLines = new Set<number>(),
  onToggleLine = () => {},
  disabled = false,
}: DiffLinesProps) {
  return (
    <>
      {isBinary && (
        <div className="flex items-center gap-2 border-b border-azure/10 bg-azure/[0.045] px-4 py-2 text-[10px] text-azure/70">
          <GitCompareArrows className="size-3.5" />
          这是二进制文件，Git 只提供差异摘要。
        </div>
      )}
      {truncated && (
        <div className="flex items-center gap-2 border-b border-brand/10 bg-brand/[0.045] px-4 py-2 text-[10px] text-brand/70">
          <TriangleAlert className="size-3.5" />
          差异过大，显示内容已截断。
        </div>
      )}
      <div className="py-1">
        {lines.map((line, index) => (
          <DiffLineRow
            key={`${index}-${line.kind}`}
            line={line}
            lineIndex={index}
            selectable={selectable}
            selected={selectedLines.has(index)}
            disabled={disabled}
            onToggleLine={onToggleLine}
          />
        ))}
      </div>
    </>
  );
}
