import {
  ChevronDown,
  ChevronRight,
  CloudDownload,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Loader2,
  Settings2,
  X,
} from "lucide-react";
import { useState } from "react";

import { BranchSection } from "@/components/branch-section";
import { RemoteSection } from "@/components/remote-section";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRecentTime } from "@/lib/format";
import { MAX_REPOS, type RepoEntry } from "@/types/ui";
import { cn } from "@/lib/utils";
import type {
  BranchInfo,
  GitError,
  RemoteInfo,
  RepositorySnapshot,
  SyncAction,
} from "@/types/git";

interface WorkspaceSidebarProps {
  snapshot: RepositorySnapshot;
  repos: RepoEntry[];
  activeRepoPath: string | null;
  branches: BranchInfo[];
  remotes: RemoteInfo[];
  refsLoading: boolean;
  refsError: GitError | null;
  isBusy: boolean;
  branchBusy: boolean;
  isSyncing: boolean;
  syncAction: SyncAction | null;
  onOpen: () => void;
  onClone: () => void;
  onInit: () => void;
  onSettings: () => void;
  onSelectRepo: (path: string) => void;
  onRemoveRepo: (path: string) => void;
  onReloadRefs: () => void;
  onCreateBranch: () => void;
  onRestoreRemote: () => void;
  onRenameBranch: (branch: BranchInfo) => void;
  onMergeBranch: (branch: BranchInfo) => void;
  onManageTags: () => void;
  onCheckoutBranch: (branch: BranchInfo) => void;
  onDeleteBranch: (branch: BranchInfo) => void;
  onManageRemotes: () => void;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onReflog: () => void;
}

export function WorkspaceSidebar({
  snapshot,
  repos,
  activeRepoPath,
  branches,
  remotes,
  refsLoading,
  refsError,
  isBusy,
  branchBusy,
  isSyncing,
  syncAction,
  onOpen,
  onClone,
  onInit,
  onSettings,
  onSelectRepo,
  onRemoveRepo,
  onReloadRefs,
  onCreateBranch,
  onRestoreRemote,
  onRenameBranch,
  onMergeBranch,
  onManageTags,
  onCheckoutBranch,
  onDeleteBranch,
  onManageRemotes,
  onFetch,
  onPull,
  onPush,
  onReflog,
}: WorkspaceSidebarProps) {
  const [reposExpanded, setReposExpanded] = useState(true);

  return (
    <aside className="relative flex h-full min-h-0 flex-col border-r border-[var(--line)] bg-[var(--surface-app)]">
      <div className="shrink-0 border-b border-[var(--line-subtle)] px-3.5 py-3.5">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] p-3">
          <div className="flex items-start gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] text-brand/80">
              <FolderGit2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium text-foreground/90">
                {snapshot.name}
              </div>
              <div
                className="mt-0.5 truncate font-mono text-[8.5px] text-muted-foreground/40"
                title={snapshot.path}
              >
                {snapshot.path}
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-1 -mt-1 size-7 text-muted-foreground/45"
                  onClick={onSettings}
                  aria-label="打开仓库配置"
                >
                  <Settings2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>仓库配置</TooltipContent>
            </Tooltip>
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-[var(--line-subtle)] pt-2.5">
            <GitBranch className="size-3.5 shrink-0 text-brand/65" />
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/70">
              {snapshot.head.detached
                ? "游离 HEAD"
                : (snapshot.head.branch ?? "尚无分支")}
            </span>
            <span className="shrink-0 font-mono text-[8.5px] text-muted-foreground/35">
              {snapshot.head.shortOid ?? "无提交"}
            </span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
        <BranchSection
          branches={branches}
          isLoading={refsLoading}
          error={refsError}
          isBusy={branchBusy}
          isDirty={!snapshot.workingTree.isClean}
          onCreate={onCreateBranch}
          onCheckout={onCheckoutBranch}
          onDelete={onDeleteBranch}
          onRename={onRenameBranch}
          onMerge={onMergeBranch}
          onReload={onReloadRefs}
          onRestoreRemote={onRestoreRemote}
          onManageTags={onManageTags}
        />
        <RemoteSection
          remotes={remotes}
          isLoading={refsLoading}
          error={refsError}
          isSyncing={isSyncing}
          syncAction={syncAction}
          onManage={onManageRemotes}
          onFetch={onFetch}
          onPull={onPull}
          onPush={onPush}
          onReflog={onReflog}
          onReload={onReloadRefs}
        />
      </div>

      <div className="shrink-0 border-t border-[var(--line-subtle)] px-3.5 py-3">
        <button
          type="button"
          onClick={() => setReposExpanded((expanded) => !expanded)}
          aria-expanded={reposExpanded}
          className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left outline-none transition-colors hover:bg-[var(--surface-subtle)] focus-visible:ring-1 focus-visible:ring-brand/25"
        >
          <FolderGit2 className="size-3 shrink-0 text-muted-foreground/45" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.19em] text-muted-foreground/55">
            仓库列表
          </span>
          <span className="font-mono text-[8.5px] text-muted-foreground/30">
            {repos.length}/{MAX_REPOS}
          </span>
          {reposExpanded ? (
            <ChevronDown className="ml-auto size-3.5 text-muted-foreground/35" />
          ) : (
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground/35" />
          )}
        </button>

        {reposExpanded && (
          <div className="mt-1.5 max-h-[176px] space-y-0.5 overflow-y-auto pr-0.5">
            {repos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--line)] px-3 py-2.5 text-[9.5px] leading-relaxed text-muted-foreground/40">
                打开或克隆仓库后会出现在这里，最多保留 {MAX_REPOS} 个。
              </div>
            ) : (
              repos.map((repo) => {
                const active =
                  repo.path.toLocaleLowerCase() ===
                  (activeRepoPath ?? snapshot.path).toLocaleLowerCase();
                return (
                  <div
                    key={repo.id || repo.path}
                    className={cn(
                      "group flex items-center rounded-lg transition-colors",
                      active
                        ? "bg-[var(--surface-muted)]"
                        : "hover:bg-[var(--surface-muted)]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectRepo(repo.path)}
                      disabled={isBusy}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left outline-none disabled:opacity-50"
                      title={repo.path}
                    >
                      <FolderGit2
                        className={cn(
                          "size-3.5 shrink-0",
                          active
                            ? "text-brand/65"
                            : "text-muted-foreground/30",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[10.5px]",
                            active
                              ? "text-foreground/85"
                              : "text-muted-foreground/70",
                          )}
                        >
                          {repo.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[8.5px] text-muted-foreground/30">
                          {formatRecentTime(repo.openedAt)}
                        </span>
                      </span>
                      {active && (
                        <span className="size-1 shrink-0 rounded-full bg-brand/70" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/35 outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-rose focus-visible:ring-1 focus-visible:ring-rose/30"
                      onClick={() => onRemoveRepo(repo.path)}
                      disabled={isBusy}
                      aria-label={`从仓库列表移除 ${repo.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className="justify-start px-2 text-[10px]"
            onClick={onOpen}
            disabled={isBusy}
          >
            {isBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FolderOpen className="size-3.5 text-brand/65" />
            )}
            打开
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="justify-start px-2 text-[10px]"
            onClick={onClone}
            disabled={isBusy}
          >
            <CloudDownload className="size-3.5 text-azure/65" />
            克隆
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="justify-start px-2 text-[10px]"
            onClick={onInit}
            disabled={isBusy}
            title="初始化仓库"
          >
            <FolderPlus className="size-3.5 text-brand/65" />
            新建
          </Button>
        </div>
      </div>
    </aside>
  );
}
