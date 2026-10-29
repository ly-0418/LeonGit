import {
  History,
  Loader2,
  RotateCw,
  TriangleAlert,
} from "lucide-react";
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
import { listReflog, toGitError } from "@/lib/git-api";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format";
import type { GitError, ReflogEntry } from "@/types/git";

interface ReflogDialogProps {
  open: boolean;
  repoPath: string;
  onOpenChange: (open: boolean) => void;
}

export function ReflogDialog({
  open,
  repoPath,
  onOpenChange,
}: ReflogDialogProps) {
  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void listReflog(repoPath, 100)
      .then((next) => {
        if (!cancelled) setEntries(next);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[80vh] max-w-[760px] gap-3">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/70">
            <History className="size-4" />
          </div>
          <DialogTitle>Reflog · HEAD 变动</DialogTitle>
          <DialogDescription>
            只读查看最近 100 条 reflog。误操作后可以在这里找到之前的 HEAD SHA，
            但客户端不提供通用撤销。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-[180px] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface-deep)]">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-[10px] text-muted-foreground/40">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              正在读取 reflog…
            </div>
          ) : error ? (
            <div className="flex h-40 flex-col items-center justify-center px-6 text-center">
              <TriangleAlert className="size-4 text-rose/65" />
              <p className="mt-2 text-[10px] text-muted-foreground/50">
                {error.message}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                重试
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-[10px] text-muted-foreground/35">
              暂无 reflog 记录。
            </div>
          ) : (
            entries.map((entry, index) => (
              <div
                key={`${entry.selector}:${index}`}
                className="flex items-start gap-3 border-t border-[var(--line-subtle)] px-3 py-2.5 first:border-t-0"
              >
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand/45" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-brand/70">
                      {entry.shortOid}
                    </span>
                    <span className="truncate text-[10px] text-foreground/70">
                      {entry.action}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[8.5px] text-muted-foreground/35">
                    <span className="font-mono">{entry.selector}</span>
                    <span>·</span>
                    <span>{entry.author}</span>
                    <span>·</span>
                    <span title={formatAbsoluteTime(entry.timestamp)}>
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                    <span className="break-all font-mono text-muted-foreground/25">
                      {entry.oid}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
          </div>
        </DialogBody>

        <DialogFooter className="border-t-0 pt-0">
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => setReloadToken((token) => token + 1)}
            disabled={isLoading}
          >
            <RotateCw className="size-3.5" />
            刷新
          </Button>
          <Button onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
