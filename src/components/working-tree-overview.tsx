import {
  Check,
  ChevronRight,
  FilePlus2,
  FileText,
  EyeOff,
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
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, type ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { StashPanel } from "@/components/stash-panel";
import { changeBadgeClass, CHANGE_LABELS } from "@/lib/changes";
import { fileName, formatCount, parentPath } from "@/lib/format";
import { repoStateInfo } from "@/lib/repo-state";
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
  onIgnore: (file: StatusFile, tracked: boolean) => void;
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
  onOpenEmptyCommit: () => void;
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

type WorkspaceItem =
  | {
      kind: "group";
      key: string;
      group: GroupDefinition;
      firstGroup: boolean;
    }
  | {
      kind: "file";
      key: string;
      groupKey: GroupKey;
      file: StatusFile;
      scope: DiffScope;
      firstFile: boolean;
      lastFile: boolean;
    };

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
  title,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  disabled: boolean;
  loading: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
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
  firstFile,
}: {
  file: StatusFile;
  groupKey: GroupKey;
  actions: WorkingTreeActions;
  onSelect: (file: StatusFile, scope: DiffScope) => void;
  scope: DiffScope;
  firstFile: boolean;
}) {
  const Icon =
    file.change === "added" || file.change === "untracked"
      ? FilePlus2
      : FileText;
  const loading = actions.isMutating && actions.actionPath === file.path;

  return (
    <div
      className={cn(
        "group flex items-center hover:bg-[var(--surface-subtle)]",
        !firstFile && "border-t border-[var(--line-subtle)]",
      )}
    >
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
        {(groupKey === "untracked" ||
          groupKey === "staged" ||
          groupKey === "unstaged") && (
          <ActionButton
            label="忽略"
            icon={EyeOff}
            tone="text-muted-foreground/45 hover:text-foreground/70"
            disabled={actions.isMutating || actions.isOpening}
            loading={false}
            title="加入 .gitignore"
            onClick={() => actions.onIgnore(file, groupKey !== "untracked")}
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

function GroupHeader({
  group,
  firstGroup,
}: {
  group: GroupDefinition;
  firstGroup: boolean;
}) {
  const Icon = group.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-0.5 pb-2",
        !firstGroup && "pt-5",
      )}
    >
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
  onOpenEmptyCommit,
  onIgnore,
  onOpenMergeTool,
  onMarkResolved,
}: WorkingTreeOverviewProps) {
  const summary = snapshot.workingTree;
  const stateInfo = repoStateInfo(snapshot.repoState);
  const commitBlocked = stateInfo.blocksCommit;
  const tiles = summaryTiles(summary);
  const actions: WorkingTreeActions = {
    isMutating,
    isOpening,
    actionPath,
    onStage,
    onUnstage,
    onDiscard,
    onIgnore,
    onOpenCommit,
    onOpenMergeTool,
    onMarkResolved,
  };
  const groups = useMemo<GroupDefinition[]>(
    () => [
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
    ],
    [snapshot.files],
  );

  const items = useMemo<WorkspaceItem[]>(() => {
    const next: WorkspaceItem[] = [];
    let firstGroup = true;
    for (const group of groups) {
      if (group.files.length === 0) {
        continue;
      }
      next.push({
        kind: "group",
        key: `group:${group.key}`,
        group,
        firstGroup,
      });
      group.files.forEach((file, index) => {
        next.push({
          kind: "file",
          key: `file:${group.key}:${file.path}:${file.change}`,
          groupKey: group.key,
          file,
          scope: group.defaultScope,
          firstFile: index === 0,
          lastFile: index === group.files.length - 1,
        });
      });
      firstGroup = false;
    }
    return next;
  }, [groups]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => {
      const item = items[index];
      if (item?.kind === "group") {
        return item.firstGroup ? 32 : 52;
      }
      return 46;
    },
    overscan: 12,
    getItemKey: (index) => items[index]?.key ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [snapshot.path, snapshot.head.branch, snapshot.head.oid]);

  const hasFiles = items.length > 0;

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
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenAmend}
                  disabled={isMutating || isOpening}
                  className="text-[8.5px] text-muted-foreground/35 underline-offset-2 transition-colors hover:text-brand/70 hover:underline disabled:pointer-events-none disabled:opacity-40"
                >
                  Amend 上次提交
                </button>
                {summary.staged === 0 && (
                  <button
                    type="button"
                    onClick={onOpenEmptyCommit}
                    disabled={isMutating || isOpening || commitBlocked}
                    title="显式创建不含文件变更的空提交"
                    className="text-[8.5px] text-muted-foreground/30 underline-offset-2 transition-colors hover:text-amber-600/75 hover:underline disabled:pointer-events-none disabled:opacity-40"
                  >
                    空提交（显式）
                  </button>
                )}
              </div>
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
            {summary.staged === 0 && (
              <span className="text-[8.5px] text-muted-foreground/35">
                没有已暂存的变更
              </span>
            )}
            <Button
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[10px]"
              onClick={onOpenCommit}
              disabled={
                summary.staged === 0 || isMutating || isOpening || commitBlocked
              }
              title={
                commitBlocked
                  ? `当前${stateInfo.label}，请先完成或中止后再提交`
                  : summary.staged === 0
                    ? "没有已暂存的变更"
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

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
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
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualItems.map((virtualItem) => {
              const item = items[virtualItem.index];
              if (!item) {
                return null;
              }
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {item.kind === "group" ? (
                    <GroupHeader
                      group={item.group}
                      firstGroup={item.firstGroup}
                    />
                  ) : (
                    <div
                      className={cn(
                        "overflow-hidden border-x border-[var(--line)] bg-[var(--surface-subtle)]",
                        item.firstFile && "rounded-t-xl border-t",
                        item.lastFile && "rounded-b-xl border-b",
                      )}
                    >
                      <FileRow
                        file={item.file}
                        groupKey={item.groupKey}
                        actions={actions}
                        onSelect={onSelectFile}
                        scope={item.scope}
                        firstFile={item.firstFile}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <StashPanel
        repoPath={snapshot.path}
        conflictedCount={summary.conflicted}
        onChanged={onRefresh}
        onError={onStashError}
      />
    </section>
  );
}
