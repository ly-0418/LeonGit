import { History, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCommitDetail, listCommits, toGitError } from "@/lib/git-api";
import { formatRelativeTime } from "@/lib/format";
import type { CommitDetail, CommitSummary, GitError } from "@/types/git";

interface CommitMessagePickerProps {
  open: boolean;
  repoPath: string;
  onOpenChange: (open: boolean) => void;
  onSelected: (detail: CommitDetail) => void;
}

export function CommitMessagePicker({
  open,
  repoPath,
  onOpenChange,
  onSelected,
}: CommitMessagePickerProps) {
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOid, setSelectedOid] = useState<string | null>(null);
  const [error, setError] = useState<GitError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCommits([]);
    setError(null);
    setIsLoading(true);
    setSelectedOid(null);
    void listCommits(repoPath, 0, 100)
      .then((page) => {
        if (!cancelled) setCommits(page.commits);
      })
      .catch((rawError: unknown) => {
        if (!cancelled) setError(toGitError(rawError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, reloadToken, repoPath]);

  const choose = async (commit: CommitSummary) => {
    if (selectedOid) return;
    setSelectedOid(commit.oid);
    setError(null);
    try {
      const detail = await getCommitDetail(repoPath, commit.oid);
      onSelected(detail);
      onOpenChange(false);
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setSelectedOid(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] max-w-[720px] gap-3 overflow-hidden">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <History className="size-4" />
          </div>
          <DialogTitle>从历史复用提交信息</DialogTitle>
          <DialogDescription>
            选择后会填充完整 message；作者信息默认只展示，不自动覆盖。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2">
          <div className="min-h-[240px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-deep)]">
          {isLoading ? (
            <div className="flex h-[260px] items-center justify-center gap-2 text-[10px] text-muted-foreground/45">
              <Loader2 className="size-4 animate-spin" />
              正在读取最近提交…
            </div>
          ) : error && commits.length === 0 ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-3 px-6 text-center">
              <TriangleAlert className="size-5 text-rose/65" />
              <p className="text-[10px] text-muted-foreground/55">{error.message}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                <RotateCw className="size-3.5" />
                重试
              </Button>
            </div>
          ) : commits.length === 0 ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
              <History className="size-6 text-muted-foreground/25" />
              <div className="text-[11px] text-foreground/65">还没有可复用提交</div>
              <p className="text-[9px] text-muted-foreground/35">
                仓库至少需要一次提交。
              </p>
            </div>
          ) : (
            <div className="max-h-[52vh] overflow-y-auto">
              {commits.map((commit) => (
                <button
                  key={commit.oid}
                  type="button"
                  onClick={() => void choose(commit)}
                  disabled={Boolean(selectedOid)}
                  className="flex w-full items-center gap-3 border-b border-[var(--line-subtle)] px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[var(--surface-subtle)] disabled:opacity-60"
                >
                  <span className="w-14 shrink-0 font-mono text-[8px] text-brand/55">
                    {commit.shortOid}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] text-foreground/75">
                      {commit.subject}
                    </span>
                    <span className="mt-0.5 block text-[8px] text-muted-foreground/35">
                      {commit.authorName} · {formatRelativeTime(commit.authoredAt)}
                    </span>
                  </span>
                  {selectedOid === commit.oid && (
                    <Loader2 className="size-3.5 animate-spin text-brand/65" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && commits.length > 0 && (
          <div className="text-[9px] text-rose/70">{error.message}</div>
        )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
