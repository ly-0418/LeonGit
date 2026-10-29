import {
  ArrowLeft,
  Check,
  FileClock,
  FileText,
  GitCompareArrows,
  Layers,
  Loader2,
  RotateCw,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DiffLines } from "@/components/diff-lines";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFileDiff, type SelectedFile } from "@/hooks/use-file-diff";
import { changeBadgeClass, CHANGE_LABELS } from "@/lib/changes";
import { fileName, parentPath } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DiffLine,
  DiffScope,
  RepositorySnapshot,
} from "@/types/git";

interface DiffHunk {
  header: string;
  headerIndex: number;
  body: DiffLine[];
}

function splitHunks(lines: DiffLine[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  lines.forEach((line, index) => {
    if (line.kind === "hunk") {
      current = { header: line.content, headerIndex: index, body: [] };
      hunks.push(current);
    } else if (current) {
      current.body.push(line);
    }
  });
  return hunks;
}

function hunkLine(line: DiffLine): string {
  if (line.kind === "addition") return `+${line.content}`;
  if (line.kind === "deletion") return `-${line.content}`;
  if (line.kind === "meta") return line.content;
  return ` ${line.content}`;
}

function buildHunkPatch(hunks: DiffHunk[]): string {
  return `${hunks
    .map((hunk) => [hunk.header, ...hunk.body.map(hunkLine)].join("\n"))
    .join("\n")}\n`;
}

function hunkStart(header: string): { oldStart: number; newStart: number } {
  const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  return {
    oldStart: Number(match?.[1] ?? 1),
    newStart: Number(match?.[2] ?? 1),
  };
}

function selectedLineNumber(line: DiffLine): number | null {
  return line.newLine ?? line.oldLine;
}

function buildLineDiscardPatch(
  hunks: DiffHunk[],
  selectedLines: Set<number>,
): { patch: string; ranges: string } {
  const patches: string[] = [];
  let delta = 0;
  const numbers: number[] = [];

  for (const hunk of hunks) {
    const selected = new Set<number>();
    hunk.body.forEach((_line, bodyIndex) => {
      const globalIndex = hunk.headerIndex + 1 + bodyIndex;
      if (selectedLines.has(globalIndex)) {
        selected.add(bodyIndex);
      }
    });
    if (selected.size === 0) {
      continue;
    }

    const { newStart } = hunkStart(hunk.header);
    const oldStart = Math.max(1, newStart + delta);
    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    let includeMeta = false;

    hunk.body.forEach((line, bodyIndex) => {
      if (line.kind === "meta") {
        if (includeMeta) body.push(line.content);
        return;
      }
      if (line.kind === "context") {
        body.push(` ${line.content}`);
        oldCount += 1;
        newCount += 1;
        includeMeta = true;
        return;
      }
      if (line.kind === "addition") {
        if (selected.has(bodyIndex)) {
          body.push(`+${line.content}`);
          newCount += 1;
          includeMeta = true;
        } else {
          // An unselected worktree addition is kept by both sides, so it can
          // be represented as context without touching it.
          body.push(` ${line.content}`);
          oldCount += 1;
          newCount += 1;
          includeMeta = true;
        }
        return;
      }
      if (line.kind === "deletion" && selected.has(bodyIndex)) {
        body.push(`-${line.content}`);
        oldCount += 1;
        includeMeta = true;
      } else {
        // An unselected deletion is absent from both desired and current.
        includeMeta = false;
      }
    });

    if (oldCount === 0 && newCount === 0) continue;

    const selectedNumbers = hunk.body
      .filter((_, bodyIndex) => selected.has(bodyIndex))
      .map(selectedLineNumber)
      .filter((value): value is number => value !== null);
    numbers.push(...selectedNumbers);
    patches.push(
      [`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...body].join(
        "\n",
      ),
    );
    const selectedAdds = hunk.body.filter(
      (line, bodyIndex) => selected.has(bodyIndex) && line.kind === "addition",
    ).length;
    const selectedDeletes = hunk.body.filter(
      (line, bodyIndex) => selected.has(bodyIndex) && line.kind === "deletion",
    ).length;
    delta += selectedDeletes - selectedAdds;
  }

  const sorted = [...new Set(numbers)].sort((left, right) => left - right);
  const ranges: string[] = [];
  for (const value of sorted) {
    const last = ranges[ranges.length - 1];
    if (!last) {
      ranges.push(`L${value}`);
      continue;
    }
    const match = last.match(/^L(\d+)(?:-L(\d+))?$/);
    const start = Number(match?.[1]);
    const end = Number(match?.[2] ?? match?.[1]);
    if (value === end + 1) {
      ranges[ranges.length - 1] = `L${start}-L${value}`;
    } else {
      ranges.push(`L${value}`);
    }
  }

  return { patch: patches.length > 0 ? `${patches.join("\n")}\n` : "", ranges: ranges.join(", ") };
}

function hunkRange(header: string): string {
  const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) return "Hunk";
  const oldCount = match[2] ?? "1";
  const newCount = match[4] ?? "1";
  return `-${match[1]},${oldCount} → +${match[3]},${newCount}`;
}


const SCOPE_TABS: Array<{
  value: DiffScope;
  label: string;
  description: string;
}> = [
  {
    value: "worktree",
    label: "工作区",
    description: "工作区与暂存区比较（git diff）",
  },
  {
    value: "staged",
    label: "已暂存",
    description: "暂存区与 HEAD 比较（git diff --cached）",
  },
  {
    value: "head",
    label: "HEAD",
    description: "工作区与 HEAD 比较（git diff HEAD）",
  },
];

interface DiffViewProps {
  snapshot: RepositorySnapshot;
  selected: SelectedFile;
  scope: DiffScope;
  indexRevision: number;
  isMutating: boolean;
  onScopeChange: (scope: DiffScope) => void;
  onStageHunks: (filePath: string, patch: string) => Promise<boolean>;
  onUnstageHunks: (filePath: string, patch: string) => Promise<boolean>;
  onOpenFileHistory: (filePath: string) => void;
  onOpenBlame: (filePath: string) => void;
  onDiscardLines: (filePath: string, patch: string) => Promise<boolean>;
  onBack: () => void;
}

export function DiffView({
  snapshot,
  selected,
  scope,
  indexRevision,
  isMutating,
  onScopeChange,
  onStageHunks,
  onUnstageHunks,
  onOpenFileHistory,
  onOpenBlame,
  onDiscardLines,
  onBack,
}: DiffViewProps) {
  const untracked = selected.file.change === "untracked";
  const hasHead = Boolean(snapshot.head.oid);
  const diffRevision = useMemo(
    () => ({ snapshot, indexRevision }),
    [snapshot, indexRevision],
  );
  const controller = useFileDiff(
    snapshot.path,
    untracked ? null : selected,
    scope,
    diffRevision,
  );
  const diff = controller.diff;
  const hunks = useMemo(() => splitHunks(diff?.lines ?? []), [diff]);
  const [selectedHunks, setSelectedHunks] = useState<Set<number>>(new Set());
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [isHunkBusy, setIsHunkBusy] = useState(false);
  const [isConfirmingHunks, setIsConfirmingHunks] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [isDiscardingLines, setIsDiscardingLines] = useState(false);

  useEffect(() => {
    setSelectedHunks(new Set());
    setSelectedLines(new Set());
    setIsConfirmingHunks(false);
    setIsDiscardConfirmOpen(false);
  }, [diff?.path, scope, selected.file.path, indexRevision]);

  useEffect(() => {
    if (scope === "head" && !hasHead) {
      onScopeChange("worktree");
    }
  }, [hasHead, onScopeChange, scope]);

  const canStageHunks =
    scope !== "head" &&
    selected.file.change === "modified" &&
    !selected.file.originalPath &&
    Boolean(diff) &&
    !diff?.isBinary &&
    !diff?.truncated &&
    hunks.length > 0;

  const canDiscardLines =
    scope === "worktree" &&
    selected.file.change === "modified" &&
    !selected.file.originalPath &&
    Boolean(diff) &&
    !diff?.isBinary &&
    !diff?.truncated &&
    hunks.length > 0;

  const discardPreview = useMemo(
    () => buildLineDiscardPatch(hunks, selectedLines),
    [hunks, selectedLines],
  );

  const toggleLine = (index: number) => {
    setSelectedLines((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const discardSelectedLines = async () => {
    if (
      isDiscardingLines ||
      !discardPreview.patch ||
      selectedLines.size === 0
    ) {
      return;
    }
    setIsDiscardingLines(true);
    try {
      const success = await onDiscardLines(
        selected.file.path,
        discardPreview.patch,
      );
      if (success) {
        setSelectedLines(new Set());
        setIsDiscardConfirmOpen(false);
      }
    } finally {
      setIsDiscardingLines(false);
    }
  };

  const applySelectedHunks = async () => {
    if (
      !diff ||
      selectedHunks.size === 0 ||
      isHunkBusy ||
      isMutating
    ) {
      return;
    }
    if (!isConfirmingHunks) {
      setIsConfirmingHunks(true);
      return;
    }

    const chosen = hunks.filter((_, index) => selectedHunks.has(index));
    const patch = buildHunkPatch(chosen);
    setIsHunkBusy(true);
    try {
      const success =
        scope === "worktree"
          ? await onStageHunks(selected.file.path, patch)
          : await onUnstageHunks(selected.file.path, patch);
      if (success) {
        setSelectedHunks(new Set());
      }
    } finally {
      setIsHunkBusy(false);
      setIsConfirmingHunks(false);
    }
  };

  const toggleHunk = (index: number) => {
    setIsConfirmingHunks(false);
    setSelectedHunks((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const { additions, deletions } = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const line of diff?.lines ?? []) {
      if (line.kind === "addition") additions += 1;
      if (line.kind === "deletion") deletions += 1;
    }
    return { additions, deletions };
  }, [diff]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-[var(--line)] px-5 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="mt-0.5 shrink-0 text-muted-foreground/55"
            onClick={onBack}
            aria-label="返回工作区概览"
          >
            <ArrowLeft className="size-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-mono text-[13px] font-medium text-foreground/90">
                {fileName(selected.file.path)}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 py-[1px] text-[9px]",
                  changeBadgeClass(selected.file.change),
                )}
              >
                {CHANGE_LABELS[selected.file.change]}
              </span>
            </div>
            <div
              className="mt-1 truncate font-mono text-[9.5px] text-muted-foreground/40"
              title={selected.file.path}
            >
              {parentPath(selected.file.path) || "."}
              {selected.file.originalPath
                ? `  ←  ${selected.file.originalPath}`
                : ""}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {diff && (
              <div className="hidden items-center gap-2 font-mono text-[10px] sm:flex">
                <span className="text-jade/75">+{additions}</span>
                <span className="text-rose/70">−{deletions}</span>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground/65"
                  onClick={() => onOpenFileHistory(selected.file.path)}
                  disabled={untracked}
                  aria-label="查看文件历史"
                >
                  <FileClock className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>查看文件历史</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground/65"
                  onClick={() => onOpenBlame(selected.file.path)}
                  disabled={untracked}
                  aria-label="查看文件 Blame"
                >
                  <UserRound className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>查看文件 Blame</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground/65"
                  onClick={controller.reload}
                  disabled={controller.isLoading || untracked}
                  aria-label="重新加载 diff"
                >
                  {controller.isLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>重新加载 diff</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {!untracked && (
          <div className="mt-3 flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--well)] p-1">
            {SCOPE_TABS.map((tab) => {
              const disabled = tab.value === "head" && !hasHead;
              return (
                <Tooltip key={tab.value}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex-1 rounded-md px-2.5 py-1.5 text-[10.5px] font-medium transition-colors",
                        scope === tab.value
                          ? "bg-[var(--surface-hover)] text-foreground shadow-sm"
                          : "text-muted-foreground/50 hover:bg-[var(--surface-muted)] hover:text-foreground/75",
                        disabled &&
                          "cursor-not-allowed opacity-35 hover:bg-transparent",
                      )}
                      onClick={() => !disabled && onScopeChange(tab.value)}
                      aria-pressed={scope === tab.value}
                    >
                      {tab.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {disabled
                      ? "仓库还没有提交，无法与 HEAD 比较"
                      : tab.description}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {canStageHunks && diff && (
          <div className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Layers className="size-3.5 shrink-0 text-brand/60" />
              <span className="text-[9.5px] font-medium text-foreground/70">
                Hunk 级暂存
              </span>
              <span className="font-mono text-[8px] text-muted-foreground/35">
                {scope === "worktree" ? "git apply --cached" : "git apply --cached --reverse"}
              </span>
              <Button
                size="sm"
                variant={isConfirmingHunks ? "default" : "secondary"}
                className="ml-auto h-7 gap-1 px-2 text-[9px]"
                onClick={() => void applySelectedHunks()}
                disabled={
                  isHunkBusy || isMutating || selectedHunks.size === 0
                }
              >
                {isHunkBusy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                {isHunkBusy
                  ? "正在应用…"
                  : isConfirmingHunks
                    ? `确认${scope === "worktree" ? "暂存" : "取消暂存"} ${selectedHunks.size} 个 Hunk`
                    : scope === "worktree"
                      ? "暂存选中 Hunk"
                      : "取消暂存选中 Hunk"}
              </Button>
              {isConfirmingHunks && !isHunkBusy && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[9px]"
                  onClick={() => setIsConfirmingHunks(false)}
                >
                  取消
                </Button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hunks.map((hunk, index) => (
                <label
                  key={`${hunk.header}:${index}`}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[8.5px] transition-colors",
                    selectedHunks.has(index)
                      ? "border-brand/30 bg-brand/[0.07] text-foreground/78"
                      : "border-[var(--line)] text-muted-foreground/55 hover:bg-[var(--surface-hover)]",
                  )}
                  title={hunk.header}
                >
                  <input
                    type="checkbox"
                    checked={selectedHunks.has(index)}
                    onChange={() => toggleHunk(index)}
                    disabled={isHunkBusy || isMutating}
                    className="size-3 accent-[var(--brand)]"
                  />
                  <span>Hunk {index + 1}</span>
                  <span className="font-mono text-muted-foreground/35">
                    {hunkRange(hunk.header)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {canDiscardLines && diff && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-rose/15 bg-rose/[0.035] px-2.5 py-2">
            <TriangleAlert className="size-3.5 shrink-0 text-rose/65" />
            <span className="text-[9.5px] font-medium text-rose/75">
              行级丢弃
            </span>
            <span className="text-[8px] text-muted-foreground/35">
              在 diff 中勾选 + / - 行
            </span>
            <span className="font-mono text-[8px] text-rose/55">
              已选 {selectedLines.size} 行
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto h-7 px-2 text-[9px] text-rose/75"
              onClick={() => setIsDiscardConfirmOpen(true)}
              disabled={selectedLines.size === 0 || isMutating || isDiscardingLines}
            >
              丢弃选中行
            </Button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[var(--surface-deep)]">
        {untracked ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="grid size-11 place-items-center rounded-xl border border-azure/15 bg-azure/[0.055] text-azure/70">
              <FileText className="size-5" />
            </div>
            <h3 className="mt-4 text-[13px] font-medium text-foreground/80">
              未跟踪文件尚无 diff
            </h3>
            <p className="mt-1.5 max-w-[350px] text-[10.5px] leading-relaxed text-muted-foreground/55">
              这个文件还没有进入 Git 索引，因此不存在可比较的暂存或 HEAD
              版本。当前阶段不提供暂存操作。
            </p>
          </div>
        ) : controller.isLoading ? (
          <div className="space-y-2 p-4" aria-label="正在加载 diff" role="status">
            {Array.from({ length: 16 }, (_, index) => (
              <div
                key={index}
                className="flex items-center gap-2"
                style={{ opacity: 0.7 - (index % 4) * 0.12 }}
              >
                <span className="h-2.5 w-7 rounded bg-[var(--surface-muted)]" />
                <span className="h-2.5 w-7 rounded bg-[var(--surface-muted)]" />
                <span
                  className="h-2.5 rounded bg-[var(--surface-hover)]"
                  style={{ width: `${28 + ((index * 17) % 58)}%` }}
                />
              </div>
            ))}
          </div>
        ) : controller.error ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="grid size-11 place-items-center rounded-xl border border-rose/15 bg-rose/[0.06] text-rose/80">
              <TriangleAlert className="size-5" />
            </div>
            <h3 className="mt-4 text-[13px] font-medium text-foreground/80">
              无法加载 diff
            </h3>
            <p className="mt-1.5 max-w-[380px] text-[10.5px] leading-relaxed text-muted-foreground/55">
              {controller.error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={controller.reload}
            >
              <RotateCw className="size-3.5" />
              重试
            </Button>
          </div>
        ) : diff && diff.lines.length > 0 ? (
          <DiffLines
            lines={diff.lines}
            isBinary={diff.isBinary}
            truncated={diff.truncated}
            selectable={canDiscardLines}
            selectedLines={selectedLines}
            onToggleLine={toggleLine}
            disabled={isMutating || isDiscardingLines}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="grid size-11 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] text-muted-foreground/40">
              <GitCompareArrows className="size-5" />
            </div>
            <h3 className="mt-4 text-[13px] font-medium text-foreground/75">
              此比较没有差异
            </h3>
            <p className="mt-1.5 max-w-[340px] text-[10.5px] leading-relaxed text-muted-foreground/50">
              工作区、暂存区与 HEAD 在该文件上可能相同。切换上方比较层，或刷新工作区后再试。
            </p>
          </div>
        )}
      </div>

      <Dialog open={isDiscardConfirmOpen} onOpenChange={setIsDiscardConfirmOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <div className="grid size-9 place-items-center rounded-xl border border-rose/20 bg-rose/[0.06] text-rose/75">
              <TriangleAlert className="size-4" />
            </div>
            <DialogTitle>确认丢弃选中行？</DialogTitle>
            <DialogDescription>
              {selected.file.path}
              <br />
              受影响行范围：{discardPreview.ranges || "未选择"}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="rounded-lg border border-rose/20 bg-rose/[0.05] px-3 py-2.5 text-[10px] leading-relaxed text-rose/80">
              此操作不可恢复，丢弃的修改不会进入 stash 或任何备份。
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDiscardConfirmOpen(false)}
              disabled={isDiscardingLines}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void discardSelectedLines()}
              disabled={isDiscardingLines}
            >
              {isDiscardingLines ? "正在丢弃…" : "确认丢弃"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
