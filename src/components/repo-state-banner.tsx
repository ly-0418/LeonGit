import { GitBranch, GitMerge, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { repoStateInfo } from "@/lib/repo-state";
import type { BranchInfo, RepoState } from "@/types/git";

interface RepoStateBannerProps {
  state: RepoState;
  conflicted?: number;
  squashSource?: string | null;
  shortSha?: string | null;
  detachedUnsaved?: boolean;
  branches?: BranchInfo[];
  onContinueMerge?: () => void;
  onAbortMerge?: () => void;
  onAbortSquash?: () => void;
  onCreateDetachedBranch?: () => void;
  onSwitchBranch?: (branch: BranchInfo) => void;
}

export function RepoStateBanner({
  state,
  conflicted = 0,
  squashSource,
  shortSha,
  detachedUnsaved = false,
  branches = [],
  onContinueMerge,
  onAbortMerge,
  onAbortSquash,
  onCreateDetachedBranch,
  onSwitchBranch,
}: RepoStateBannerProps) {
  if (state === "normal") {
    if (conflicted === 0) {
      return null;
    }
    return (
      <div
        role="status"
        className="mb-3 flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.045] px-3 py-2.5 text-rose/70"
      >
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium">
            {squashSource ? "Squash 合并产生冲突" : "冲突待解决"}
          </div>
          <p className="mt-0.5 text-[9px] leading-relaxed opacity-80">
            {squashSource
              ? `来自 ${squashSource} 的 Squash 变更产生了 ${conflicted} 个冲突文件；解决后提交即可完成 Squash 合并，或中止本次 Squash 合并。`
              : `当前有 ${conflicted} 个冲突文件（可能来自 stash 应用）；请使用合并工具，或标记已解决后继续。`}
          </p>
        </div>
        {squashSource && onAbortSquash && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-6 shrink-0 px-2 text-[8.5px]"
            onClick={onAbortSquash}
          >
            中止 Squash
          </Button>
        )}
      </div>
    );
  }

  const info = repoStateInfo(state);
  const Icon =
    state === "merging"
      ? GitMerge
      : state === "reverting"
        ? RotateCcw
        : state === "detachedHead"
          ? GitBranch
          : TriangleAlert;
  const isMerge = state === "merging";
  const isDetached = state === "detachedHead";
  const description = isDetached
    ? `当前 HEAD 指向 ${shortSha ?? "未知"}，不在任何分支上。提交会产生游离 commit${
        detachedUnsaved ? "，且该 commit 尚未关联任何分支" : ""
      }。`
    : info.description;

  return (
    <div
      role="status"
      className={cn(
        "mb-3 flex items-start gap-2 rounded-lg border px-3 py-2.5",
        isMerge || isDetached
          ? "border-[var(--warning-border)] bg-[var(--warning-surface)] text-[var(--warning)]"
          : "border-rose/15 bg-rose/[0.045] text-rose/70",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium">{info.label}</div>
        <p className="mt-0.5 text-[9px] leading-relaxed opacity-80">
          {description}
        </p>
      </div>
      {isMerge && (
        <div className="flex shrink-0 items-center gap-1.5">
          {onContinueMerge && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-6 shrink-0 px-2 text-[8.5px]"
              onClick={onContinueMerge}
              disabled={conflicted > 0}
              title={
                conflicted > 0
                  ? "请先解决并标记所有冲突文件"
                  : "解决冲突后提交合并结果"
              }
            >
              继续
            </Button>
          )}
          {onAbortMerge && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-6 shrink-0 px-2 text-[8.5px]"
              onClick={onAbortMerge}
            >
              中止 merge
            </Button>
          )}
        </div>
      )}
      {isDetached && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {onCreateDetachedBranch && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-6 shrink-0 px-2 text-[8.5px]"
              onClick={onCreateDetachedBranch}
            >
              创建分支保存
            </Button>
          )}
          {branches.length > 0 && onSwitchBranch && (
            <select
              defaultValue=""
              aria-label="回到某个分支"
              onChange={(event) => {
                const branch = branches.find(
                  (item) => item.name === event.target.value,
                );
                event.currentTarget.value = "";
                if (branch) onSwitchBranch(branch);
              }}
              className="h-6 max-w-[130px] rounded-md border border-[var(--line)] bg-[var(--surface-subtle)] px-1.5 font-mono text-[8px] text-foreground/70 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">回到分支…</option>
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
