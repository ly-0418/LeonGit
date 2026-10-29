import { CloudDownload, GitBranch, Loader2, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toGitError, listRemoteBranches } from "@/lib/git-api";
import { formatRelativeTime } from "@/lib/format";
import type { BranchInfo, GitError, RemoteBranchInfo } from "@/types/git";

interface RemoteBranchDialogProps {
  open: boolean;
  repoPath: string;
  localBranches: BranchInfo[];
  isBusy: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (remote: string, branch: string) => void;
}

export function RemoteBranchDialog({
  open,
  repoPath,
  localBranches,
  isBusy,
  onOpenChange,
  onRestore,
}: RemoteBranchDialogProps) {
  const [branches, setBranches] = useState<RemoteBranchInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setBranches([]);
    setIsLoading(true);
    setError(null);
    void listRemoteBranches(repoPath)
      .then((items) => {
        if (!cancelled) {
          setBranches(items);
        }
      })
      .catch((rawError: unknown) => {
        if (!cancelled) {
          setError(toGitError(rawError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, reloadToken, repoPath]);

  const localNames = new Set(localBranches.map((branch) => branch.name));
  const restorable = branches.filter((branch) => !localNames.has(branch.name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] text-azure/80">
            <CloudDownload className="size-4" />
          </div>
          <DialogTitle>从远程分支恢复</DialogTitle>
          <DialogDescription>
            从已 Fetch 的远程跟踪分支创建并检出本地分支。若列表中没有目标分支，请先在远程区执行
            Fetch。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2">
          <div className="flex items-center justify-between">
          <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/45">
            可恢复的远程分支
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[9px] text-muted-foreground/55"
            onClick={() => setReloadToken((token) => token + 1)}
            disabled={isLoading || isBusy}
          >
            <RotateCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
            刷新列表
          </Button>
        </div>

        <div className="max-h-[46vh] min-h-[120px] space-y-1 overflow-y-auto pr-0.5">
          {isLoading ? (
            <div className="flex h-[120px] items-center justify-center gap-2 text-[10px] text-muted-foreground/50">
              <Loader2 className="size-3.5 animate-spin" />
              正在读取远程分支…
            </div>
          ) : error ? (
            <div className="flex h-[120px] flex-col items-center justify-center gap-2 px-4 text-center">
              <div className="text-[10px] text-rose/70">{error.message}</div>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-[9px]"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                重试
              </Button>
            </div>
          ) : restorable.length === 0 ? (
            <div className="flex h-[120px] flex-col items-center justify-center gap-1.5 px-4 text-center">
              <GitBranch className="size-4 text-muted-foreground/30" />
              <div className="text-[10px] text-muted-foreground/55">
                {branches.length === 0
                  ? "没有可用的远程分支"
                  : "所有远程分支都已经存在于本地"}
              </div>
              <div className="text-[8.5px] text-muted-foreground/35">
                {branches.length === 0
                  ? "请先在远程区执行 Fetch，再打开此面板。"
                  : "无需重复恢复。"}
              </div>
            </div>
          ) : (
            restorable.map((branch) => (
              <div
                key={`${branch.remote}/${branch.name}`}
                className="group flex items-center gap-2.5 rounded-lg border border-[var(--line-subtle)] bg-[var(--surface-subtle)] px-3 py-2"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface-muted)] text-azure/65">
                  <GitBranch className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[10.5px] text-foreground/80">
                    {branch.fullName}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[8.5px] text-muted-foreground/40">
                    <span className="truncate">
                      {branch.lastSubject || "（无提交说明）"}
                    </span>
                    <span className="shrink-0">·</span>
                    <span className="shrink-0">
                      {formatRelativeTime(branch.lastCommittedAt)}
                    </span>
                    <span className="shrink-0">·</span>
                    <span className="shrink-0 font-mono">
                      {branch.shortOid}
                    </span>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-[9px]"
                  onClick={() => onRestore(branch.remote, branch.name)}
                  disabled={isBusy}
                >
                  <CloudDownload className="size-3" />
                  检出
                </Button>
              </div>
            ))
          )}
        </div>

        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
