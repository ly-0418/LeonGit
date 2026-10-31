import { History, Loader2, TriangleAlert } from "lucide-react";
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
import { countSoftReset, resetSoft, toGitError } from "@/lib/git-api";
import type { GitError } from "@/types/git";

interface SoftResetDialogProps {
  open: boolean;
  repoPath: string | null;
  targetSha: string | null;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
}

export function SoftResetDialog({
  open,
  repoPath,
  targetSha,
  onOpenChange,
  onReset,
}: SoftResetDialogProps) {
  const [commitCount, setCommitCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  useEffect(() => {
    if (!open || !repoPath || !targetSha) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setCommitCount(null);
    setError(null);
    void countSoftReset(repoPath, targetSha)
      .then((count) => {
        if (!cancelled) {
          setCommitCount(count);
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
  }, [open, repoPath, targetSha]);

  const shortSha = targetSha?.slice(0, 8) ?? "";
  const canReset =
    Boolean(repoPath) &&
    Boolean(targetSha) &&
    commitCount !== null &&
    commitCount > 0 &&
    !isLoading &&
    !isResetting;

  const submit = async () => {
    if (!canReset || !repoPath || !targetSha) {
      return;
    }
    setIsResetting(true);
    setError(null);
    try {
      await resetSoft(repoPath, targetSha);
      onReset();
      onOpenChange(false);
    } catch (rawError: unknown) {
      setError(toGitError(rawError));
    } finally {
      setIsResetting(false);
    }
  };

  if (!open || !targetSha) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isResetting) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!isResetting} className="max-w-[520px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-amber-500/20 bg-amber-500/[0.06] text-amber-600">
            <History className="size-4" />
          </div>
          <DialogTitle>软回退到此提交</DialogTitle>
          <DialogDescription>
            只执行 <code>git reset --soft</code>，只移动 HEAD。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[10px] text-muted-foreground/50">
              <Loader2 className="size-3.5 animate-spin" />
              正在计算会移动的提交数量…
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.055] px-3 py-2.5 text-[10px] leading-relaxed text-amber-700/85 dark:text-amber-300/80">
              {commitCount !== null && commitCount > 0 ? (
                <>
                  <p>
                    将 HEAD 移动到{" "}
                    <span className="font-mono">{shortSha}</span>，最近{" "}
                    <strong>{commitCount}</strong> 个提交的变更会保留在暂存区。
                  </p>
                  <p className="mt-1.5 font-medium">不会丢失任何文件修改。</p>
                </>
              ) : commitCount === 0 ? (
                "目标提交就是当前 HEAD，无需软回退。"
              ) : (
                "无法计算软回退范围。"
              )}
            </div>
          )}

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[9.5px] leading-relaxed text-muted-foreground/55">
            被回退的提交会从当前分支历史移除，索引中的变更保留；不会执行
            reset --mixed、reset --hard，也不会 push 或删除任何远程分支。
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.05] px-3 py-2 text-[9.5px] leading-relaxed text-rose/75"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {error.message}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isResetting}
          >
            取消
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!canReset}>
            {isResetting ? <Loader2 className="animate-spin" /> : <History />}
            {isResetting ? "正在回退…" : "确认软回退"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
