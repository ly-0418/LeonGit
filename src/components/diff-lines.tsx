import { GitCompareArrows, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  totalLines?: number;
  hasInvalidUtf8?: boolean;
  onLoadFull?: () => void;
  isLoadingFull?: boolean;
  /** The user already loaded the maximum number of lines we render. */
  limitReached?: boolean;
  selectable?: boolean;
  selectedLines?: Set<number>;
  onToggleLine?: (index: number) => void;
  disabled?: boolean;
}

export function DiffLines({
  lines,
  isBinary = false,
  truncated = false,
  totalLines = 0,
  hasInvalidUtf8 = false,
  onLoadFull,
  isLoadingFull = false,
  limitReached = false,
  selectable = false,
  selectedLines = new Set<number>(),
  onToggleLine = () => {},
  disabled = false,
}: DiffLinesProps) {
  if (isBinary) {
    return (
      <div
        role="status"
        className="flex h-full min-h-[220px] flex-col items-center justify-center px-8 text-center"
      >
        <div className="grid size-11 place-items-center rounded-xl border border-azure/15 bg-azure/[0.05] text-azure/75">
          <GitCompareArrows className="size-5" />
        </div>
        <h3 className="mt-4 text-[13px] font-medium text-foreground/80">
          二进制文件已变更
        </h3>
        <p className="mt-1.5 max-w-[360px] text-[10.5px] leading-relaxed text-muted-foreground/55">
          二进制文件已变更，无法显示文本 diff
        </p>
      </div>
    );
  }

  return (
    <>
      {truncated && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand/10 bg-brand/[0.045] px-4 py-2 text-[10px] text-brand/70">
          <TriangleAlert className="size-3.5" />
          <span>
            {limitReached
              ? `已加载 ${lines.length}${
                  totalLines > 0 ? ` / ${totalLines}` : ""
                } 行，达到单文件查看上限；其余内容请在命令行查看`
              : `diff 过大，已截断显示前 ${lines.length}${
                  totalLines > 0 ? ` / ${totalLines}` : ""
                } 行`}
          </span>
          {!limitReached && onLoadFull && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="ml-auto h-6 px-2 text-[8.5px]"
              onClick={onLoadFull}
              disabled={isLoadingFull}
            >
              {isLoadingFull && <Loader2 className="animate-spin" />}
              {isLoadingFull ? "正在加载…" : "加载完整 diff"}
            </Button>
          )}
        </div>
      )}
      {hasInvalidUtf8 && (
        <div className="flex items-center gap-2 border-b border-amber-500/15 bg-amber-500/[0.045] px-4 py-2 text-[10px] text-amber-700/75 dark:text-amber-300/70">
          <TriangleAlert className="size-3.5" />
          文件包含非 UTF-8 字节，已以替换字符显示；为防误写，hunk 操作已禁用。
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
