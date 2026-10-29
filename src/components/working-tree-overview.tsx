import {
  Check,
  ChevronRight,
  FilePlus2,
  FileText,
  GitCommitHorizontal,
  GitMerge,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { StashPanel } from "@/components/stash-panel";
import { changeBadgeClass, CHANGE_LABELS } from "@/lib/changes";
import { fileName, formatCount, parentPath } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DiffScope,
  RepositorySnapshot,
  StatusFile,
  WorkingTreeSummary,
} from "@/types/git";

type GroupKey = "conflicted" | "staged" | "unstaged" | "untracked";

interface WorkingTreeActions {
  isMutating: boolean;
  isOpening: boolean;
  actionPath: string | null;
  onStage: (file: StatusFile) => void;
  onUnstage: (file: StatusFile) => void;
  onDiscard: (file: StatusFile) => void;
  onOpenCommit: () => void;
  onOpenMergeTool: (file: StatusFile) => void;
  onMarkResolved: (file: StatusFile) => void;
}

interface WorkingTreeOverviewProps extends WorkingTreeActions {
  snapshot: RepositorySnapshot;
  isRefreshing: boolean;
  onRefresh: () => void;
  onStageAll: () => void;
  onOpenAmend: () => void;
  onStashError: (error: unknown) => void;
  onSelectFile: (file: StatusFile, scope: DiffScope) => void;
}

interface GroupDefinition {
  key: GroupKey;
  label: string;
  description: string;
  files: StatusFile[];
  defaultScope: DiffScope;
  tone: string;
  dot: string;
  icon: ComponentType<{ className?: string }>;
}

function summaryTiles(summary: WorkingTreeSummary) {
  return [
    {
      key: "staged",
      label: "已暂存",
      count: summary.staged,
      tone: "text-jade",
      dot: "bg-jade",
    },
    {
      key: "unstaged",
      label: "未暂存",
      count: summary.unstaged,
      tone: "text-brand",
      dot: "bg-brand",
    },
    {
      key: "untracked",
      label: "未跟踪",
      count: summary.untracked,
      tone: "text-azure",
      dot: "bg-azure",
    },
    {
      key: "conflicted",
      label: "冲突",
      count: summary.conflicted,
      tone: "text-rose",
      dot: "bg-rose",
    },
  ];
}

function ActionButton({
  label,
  icon: Icon,
  tone,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-[5px] border border-[var(--line)] bg-[var(--surface-subtle)] px-1.5 text-[8.5px] outline-none transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)] focus-visible:ring-1 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-35",
        tone,
      )}
    >
      {loading ? (
        <Loader2 className="size-2.5 animate-spin" />
      ) : (
        <Icon className="size-2.5" />
      )}
      {label}
    </button>
  );
}

function FileRow({
  file,
  groupKey,
  actions,
  onSelect,
  scope,
}: {
  file: StatusFile;
  groupKey: GroupKey;
  actions: WorkingTreeActions;
  onSelect: (file: StatusFile, scope: DiffScope) => void;
  scope: DiffScope;
}) {
  const Icon =
    file.change === "added" || file.change === "untracked"
      ? FilePlus2
      : FileText;
  const loading = actions.isMutating && actions.actionPath === file.path;

  return (
    <div className="group flex items-center border-t border-[var(--line-subtle)] first:border-t-0 hover:bg-[var(--surface-subtle)]">
      <button
        type="button"
        onClick={() => onSelect(file, scope)}
        className="flex min-w-0 flex-1 items-start gap-2.5 py-2.5 pl-3 pr-2 text-left outline-none focus-visible:bg-[var(--surface-muted)]"
      >
        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/35 group-hover:text-brand/60" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-[11.5px] text-foreground/80 group-hover:text-foreground/95">
              {fileName(file.path)}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-[4px] border px-1 py-px text-[8.5px] leading-none",
                changeBadgeClass(file.change),
              )}
            >
              {CHANGE_LABELS[file.change]}
            </span>
          </div>
          <div
            className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground/35"
            title={file.path}
          >
            {parentPath(file.path) || "."}
            {file.originalPath ? `  ←  ${file.originalPath}` : ""}
          </div>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1 pr-2">
        {groupKey === "staged" && (
          <ActionButton
            label="取消暂存"
            icon={Undo2}
            tone="text-muted-foreground/55 hover:text-foreground/80"
            disabled={actions.isMutating || actions.isOpening}
            loading={loading}
            onClick={() => actions.onUnstage(file)}
          />
        )}
        {(groupKey === "unstaged" || groupKey === "untracked") && (
          <ActionButton
            label="暂存"
            icon={Plus}
            tone="text-jade/65 hover:text-jade/90"
            disabled={actions.isMutating || actions.isOpening}
            loading={loading}
            onClick={() => actions.onStage(file)}
          />
        )}
        {groupKey === "unstaged" && (
          <ActionButton
            label="丢弃"
            icon={RotateCcw}
            tone="text-rose/55 hover:text-rose/85"
            disabled={actions.isMutating || actions.isOpening}
            loading={loading}
            onClick={() => actions.onDiscard(file)}
          />
        )}
        {groupKey === "conflicted" && (
          <>
            <ActionButton
              label="合并工具"
              icon={GitMerge}
              tone="text-violet/65 hover:text-violet/90"
              disabled={actions.isMutating || actions.isOpening}
              loading={loading}
              onClick={() => actions.onOpenMergeTool(file)}
            />
            <ActionButton
              label="标记已解决"
              icon={Check}
              tone="text-jade/65 hover:text-jade/90"
              disabled={actions.isMutating || actions.isOpening}
              loading={loading}
              onClick={() => actions.onMarkResolved(file)}
            />
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => onSelect(file, scope)}
        className="grid size-6 shrink-0 place-items-center text-muted-foreground/15 outline-none transition-colors hover:text-muted-foreground/45"
        aria-label="查看文件 diff"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}

function GroupSection({
  group,
  actions,
  onSelectFile,
}: {
  group: GroupDefinition;
  actions: WorkingTreeActions;
  onSelectFile: (file: StatusFile, scope: DiffScope) => void;
}) {
  if (group.files.length === 0) {
    return null;
  }

  const Icon = group.icon;

  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <Icon className={cn("size-3.5", group.tone)} />
        <span className="text-[10.5px] font-medium text-foreground/70">
          {group.label}
        </span>
        <span className={cn("size-1.5 rounded-full", group.dot)} />
        <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground/35">
          {formatCount(group.files.length)}
        </span>
        <span className="ml-auto text-[9px] text-muted-foreground/30">
          {group.description}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)]">
        {group.files.map((file) => (
          <FileRow
            key={`${group.key}:${file.path}:${file.change}`}
            file={file}
            groupKey={group.key}
            actions={actions}
            onSelect={onSelectFile}
            scope={group.defaultScope}
          />
        ))}
      </div>
    </section>
  );
}

export function WorkingTreeOverview({
  snapshot,
  isRefreshing,
  isMutating,
  isOpening,
  actionPath,
  onRefresh,
  onStageAll,
  onStashError,
  onSelectFile,
  onStage,
  onUnstage,
  onDiscard,
  onOpenCommit,
  onOpenAmend,
  onOpenMergeTool,
  onMarkResolved,
}: WorkingTreeOverviewProps) {
  const summary = snapshot.workingTree;
  const tiles = summaryTiles(summary);
  const actions: WorkingTreeActions = {
    isMutating,
    isOpening,
    actionPath,
    onStage,
    onUnstage,
    onDiscard,
    onOpenCommit,
    onOpenMergeTool,
    onMarkResolved,
  };
  const groups: GroupDefinition[] = [
    {
      key: "conflicted",
      label: "冲突",
      description: "打开外部工具或标记已解决",
      files: snapshot.files.conflicted,
      defaultScope: "worktree",
      tone: "text-rose",
      dot: "bg-rose",
      icon: TriangleAlert,
    },
    {
      key: "staged",
      label: "已暂存",
      description: "已进入索引",
      files: snapshot.files.staged,
      defaultScope: "staged",
      tone: "text-jade",
      dot: "bg-jade",
      icon: Check,
    },
    {
      key: "unstaged",
      label: "未暂存",
      description: "工作区已修改",
      files: snapshot.files.unstaged,
      defaultScope: "worktree",
      tone: "text-brand",
      dot: "bg-brand",
      icon: PencilLine,
    },
    {
      key: "untracked",
      label: "未跟踪",
      description: "尚未进入 Git",
      files: snapshot.files.untracked,
      defaultScope: "worktree",
      tone: "text-azure",
      dot: "bg-azure",
      icon: FilePlus2,
    },
  ];
  const hasFiles = groups.some((group) => group.files.length > 0);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-[var(--line)] px-5 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground/90">
                工作区变更
              </span>
              {!summary.isClean && (
                <span className="rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-1.5 py-px font-mono text-[9px] text-muted-foreground/55">
                  {formatCount(
                    summary.staged +
                      summary.unstaged +
                      summary.untracked +
                      summary.conflicted,
                  )}
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/45">
              整文件暂存 · 在文件行内操作
            </p>
            {snapshot.head.oid && (
              <button
                type="button"
                onClick={onOpenAmend}
                disabled={isMutating || isOpening}
                className="mt-1.5 text-[8.5px] text-muted-foreground/35 underline-offset-2 transition-colors hover:text-brand/70 hover:underline disabled:pointer-events-none disabled:opacity-40"
              >
                Amend 上次提交
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isMutating && !actionPath && (
              <span className="inline-flex items-center gap-1 text-[8.5px] text-brand/55">
                <Loader2 className="size-3 animate-spin" />
                正在暂存…
              </span>
            )}
            {(summary.unstaged > 0 || summary.untracked > 0) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-[10px]"
                onClick={onStageAll}
                disabled={isMutating || isOpening}
              >
                <Plus className="size-3.5" />
                全部暂存
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[10px]"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="刷新工作区"
            >
              <RefreshCw
                className={cn("size-3.5", isRefreshing && "animate-spin")}
              />
              {isRefreshing ? "刷新中" : "刷新"}
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[10px]"
              onClick={onOpenCommit}
              disabled={summary.staged === 0 || isMutating || isOpening}
              title={
                summary.staged === 0
                  ? "暂存文件后才能提交"
                  : "提交已暂存变更"
              }
            >
              <GitCommitHorizontal className="size-3.5" />
              提交{summary.staged > 0 ? ` ${summary.staged}` : ""}
            </Button>
          </div>
        </div>

        {hasFiles && (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {tiles.map((tile) => (
              <div
                key={tile.key}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-2.5 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", tile.dot)} />
                  <span className="text-[9px] text-muted-foreground/45">
                    {tile.label}
                  </span>
                </div>
                <div
                  className={cn(
                    "mt-1 font-mono text-[16px] leading-none tabular-nums",
                    tile.count > 0 ? tile.tone : "text-muted-foreground/25",
                  )}
                >
                  {formatCount(tile.count)}
                </div>
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!hasFiles ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="grid size-12 place-items-center rounded-2xl border border-jade/15 bg-jade/[0.045] text-jade/75">
              <Check className="size-5" />
            </div>
            <h3 className="mt-4 text-[14px] font-medium text-foreground/80">
              工作区干净
            </h3>
            <p className="mt-1.5 max-w-[330px] text-[10.5px] leading-relaxed text-muted-foreground/50">
              当前没有已暂存、未暂存、未跟踪或冲突文件。修改文件后点击刷新即可看到变化。
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              刷新工作区
            </Button>
          </div>
        ) : (
          <div className="space-y-5 pb-2">
            {groups.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                actions={actions}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
      <StashPanel
        repoPath={snapshot.path}
        onChanged={onRefresh}
        onError={onStashError}
      />
    </section>
  );
}
