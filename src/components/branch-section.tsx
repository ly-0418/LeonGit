import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CloudDownload,
  GitBranch,
  GitMerge,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Tag,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { BranchInfo, GitError } from "@/types/git";

interface BranchSectionProps {
  branches: BranchInfo[];
  isLoading: boolean;
  error: GitError | null;
  isBusy: boolean;
  isDirty: boolean;
  onCreate: () => void;
  onCheckout: (branch: BranchInfo) => void;
  onDelete: (branch: BranchInfo) => void;
  onRename: (branch: BranchInfo) => void;
  onSetUpstream: (branch: BranchInfo) => void;
  onMerge: (branch: BranchInfo) => void;
  onReload: () => void;
  onRestoreRemote: () => void;
  onManageTags: () => void;
}

export function BranchSection({
  branches,
  isLoading,
  error,
  isBusy,
  isDirty,
  onCreate,
  onCheckout,
  onDelete,
  onRename,
  onSetUpstream,
  onMerge,
  onReload,
  onRestoreRemote,
  onManageTags,
}: BranchSectionProps) {
  return (
    <section>
      <div className="flex items-center gap-2 px-1">
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.19em] text-muted-foreground/55"
        >
          分支
        </span>
        <span className="font-mono text-[8.5px] text-muted-foreground/25">
          {branches.length}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground/45"
                onClick={onReload}
                disabled={isLoading || isBusy}
                aria-label="刷新分支"
              >
                <RotateCw className={cn("size-3", isLoading && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新分支</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground/50"
                onClick={onRestoreRemote}
                disabled={isBusy}
                aria-label="从远程分支恢复"
              >
                <CloudDownload className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>从远程分支恢复</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground/50"
                onClick={onManageTags}
                disabled={isBusy}
                aria-label="管理标签"
              >
                <Tag className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>管理标签</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground/50"
                onClick={onCreate}
                disabled={isBusy}
                aria-label="创建分支"
              >
                <Plus className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>创建分支</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {isDirty && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-2 py-1.5 text-[8.5px] leading-relaxed text-[var(--warning)]">
          <AlertTriangle className="mt-0.5 size-2.5 shrink-0" />
          工作区有未提交修改，切换分支会被拦截。
        </div>
      )}

      <div className="mt-2 space-y-0.5">
        {isLoading && branches.length === 0 ? (
          Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex h-8 animate-pulse items-center gap-2 rounded-lg bg-[var(--surface-subtle)] px-2"
            >
              <span className="size-2 rounded-full bg-[var(--surface-hover)]" />
              <span className="h-2 w-20 rounded bg-[var(--surface-hover)]" />
            </div>
          ))
        ) : error && branches.length === 0 ? (
          <div className="rounded-lg border border-rose/10 bg-rose/[0.03] px-2.5 py-2 text-[8.5px] leading-relaxed text-rose/60">
            {error.message}
            <button
              type="button"
              onClick={onReload}
              className="ml-1 underline underline-offset-2 hover:text-rose/85"
            >
              重试
            </button>
          </div>
        ) : branches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--line-subtle)] px-2.5 py-2 text-[8.5px] text-muted-foreground/30">
            还没有本地分支。
          </div>
        ) : (
          branches.map((branch) => (
            <div
              key={branch.name}
              className={cn(
                "group flex items-center rounded-lg transition-colors",
                branch.isCurrent
                  ? "bg-brand/[0.055]"
                  : "hover:bg-[var(--surface-muted)]",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  if (!branch.isCurrent) onCheckout(branch);
                }}
                disabled={isBusy || branch.isCurrent}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left outline-none disabled:cursor-default"
                title={
                  branch.isCurrent
                    ? `当前分支 ${branch.name}`
                    : `切换到 ${branch.name}${branch.upstream ? `（upstream ${branch.upstream}）` : ""}`
                }
              >
                {branch.isCurrent ? (
                  <Check className="size-3 shrink-0 text-brand/75" />
                ) : (
                  <GitBranch className="size-3 shrink-0 text-muted-foreground/35 group-hover:text-brand/55" />
                )}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono text-[9.5px]",
                    branch.isCurrent
                      ? "text-foreground/85"
                      : "text-muted-foreground/60 group-hover:text-foreground/80",
                  )}
                >
                  {branch.name}
                </span>
                {branch.upstream && (
                  <span
                    className="max-w-[88px] shrink-0 truncate font-mono text-[7.5px] text-muted-foreground/30"
                    title={`upstream: ${branch.upstream}`}
                  >
                    ↗ {branch.upstream}
                  </span>
                )}
                {!branch.isMerged && !branch.isCurrent && (
                  <span
                    className="shrink-0 rounded-full border border-rose/15 bg-rose/[0.04] px-1 text-[7px] text-rose/55"
                    title="未合并到当前 HEAD"
                  >
                    未合并
                  </span>
                )}
                {(branch.ahead > 0 || branch.behind > 0) && (
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[7.5px]">
                    {branch.ahead > 0 && (
                      <span className="inline-flex items-center text-jade/65">
                        <ArrowUp className="size-2" />
                        {branch.ahead}
                      </span>
                    )}
                    {branch.behind > 0 && (
                      <span className="inline-flex items-center text-rose/55">
                        <ArrowDown className="size-2" />
                        {branch.behind}
                      </span>
                    )}
                  </span>
                )}
              </button>

              {!branch.isCurrent && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onMerge(branch)}
                      disabled={isBusy}
                      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/15 opacity-0 outline-none transition-opacity hover:bg-brand/[0.07] hover:text-brand/65 focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
                      aria-label={`合并分支 ${branch.name}`}
                    >
                      <GitMerge className="size-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>合并到当前分支</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSetUpstream(branch)}
                    disabled={isBusy}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/15 opacity-0 outline-none transition-opacity hover:bg-brand/[0.07] hover:text-brand/65 focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
                    aria-label={`修改 ${branch.name} 的 upstream`}
                  >
                    <Link2 className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>修改 upstream</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onRename(branch)}
                    disabled={isBusy}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/15 opacity-0 outline-none transition-opacity hover:bg-[var(--surface-hover)] hover:text-foreground/65 focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
                    aria-label={`重命名分支 ${branch.name}`}
                  >
                    <Pencil className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>重命名分支</TooltipContent>
              </Tooltip>

              {!branch.isCurrent && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onDelete(branch)}
                      disabled={isBusy}
                      className="mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/15 opacity-0 outline-none transition-opacity hover:bg-rose/[0.07] hover:text-rose/65 focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
                      aria-label={`删除分支 ${branch.name}`}
                    >
                      {isBusy ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>删除本地分支</TooltipContent>
                </Tooltip>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
