import { useVirtualizer } from "@tanstack/react-virtual";
import { FileClock, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFileHistory } from "@/hooks/use-file-history";
import { fileName, formatRelativeTime } from "@/lib/format";

interface FileHistoryDialogProps {
  open: boolean;
  repoPath: string;
  filePath: string | null;
  onOpenChange: (open: boolean) => void;
  onOpenCommit: (oid: string) => void;
}

const ROW_HEIGHT = 62;

export function FileHistoryDialog({
  open,
  repoPath,
  filePath,
  onOpenChange,
  onOpenCommit,
}: FileHistoryDialogProps) {
  const history = useFileHistory(repoPath, open ? filePath : null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowCount =
    history.commits.length +
    (history.hasMore || history.isLoadingMore ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) =>
      history.commits[index]?.oid ?? "__file_history_trailing__",
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex =
    virtualItems.length > 0
      ? virtualItems[virtualItems.length - 1].index
      : -1;

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filePath, open]);

  useEffect(() => {
    if (lastVirtualIndex < 0 || lastVirtualIndex < history.commits.length - 3) {
      return;
    }
    void history.loadMore();
  }, [history.commits.length, history.loadMore, lastVirtualIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] gap-3">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <FileClock className="size-4" />
          </div>
          <DialogTitle>文件历史</DialogTitle>
          <DialogDescription className="truncate font-mono">
            {filePath ?? "未选择文件"} · 使用 git log --follow -M
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-deep)]">
          {history.isLoading && history.commits.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center gap-2 text-[11px] text-muted-foreground/45">
              <Loader2 className="size-4 animate-spin" />
              正在读取文件历史…
            </div>
          ) : history.error && history.commits.length === 0 ? (
            <div className="flex h-[300px] flex-col items-center justify-center gap-3 px-6 text-center">
              <TriangleAlert className="size-5 text-rose/65" />
              <p className="text-[11px] leading-relaxed text-muted-foreground/55">
                {history.error.message}
              </p>
              <Button variant="secondary" size="sm" onClick={history.retry}>
                <RotateCw className="size-3.5" />
                重试
              </Button>
            </div>
          ) : history.commits.length === 0 ? (
            <div className="flex h-[300px] flex-col items-center justify-center gap-2 px-6 text-center">
              <FileClock className="size-6 text-muted-foreground/25" />
              <div className="text-[12px] font-medium text-foreground/65">
                没有文件历史
              </div>
              <p className="max-w-[420px] text-[10px] leading-relaxed text-muted-foreground/40">
                文件当前不在 HEAD 中，或尚未产生可追踪的提交历史。未跟踪文件和空仓库不会显示历史。
              </p>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="h-[min(56vh,480px)] overflow-y-auto overscroll-contain"
            >
              <div
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualItems.map((virtualRow) => {
                  const commit = history.commits[virtualRow.index];
                  if (!commit) {
                    return (
                      <div
                        key={virtualRow.key}
                        className="absolute left-0 top-0 flex w-full items-center justify-center gap-2 text-[9px] text-muted-foreground/35"
                        style={{
                          height: virtualRow.size,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {history.isLoadingMore ? (
                          <>
                            <Loader2 className="size-3 animate-spin" />
                            正在加载更多…
                          </>
                        ) : history.hasMore ? (
                          "滚动加载更多"
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={virtualRow.key}
                      type="button"
                      onClick={() => {
                        onOpenCommit(commit.oid);
                        onOpenChange(false);
                      }}
                      className="absolute left-0 top-0 flex w-full items-center gap-3 border-b border-[var(--line-subtle)] px-4 text-left outline-none transition-colors hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)]"
                      style={{
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <span className="w-14 shrink-0 font-mono text-[8.5px] text-brand/55">
                        {commit.shortOid}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10.5px] text-foreground/78">
                          {commit.subject || "（无标题）"}
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-[8.5px] text-muted-foreground/35">
                          <span className="truncate">{commit.authorName}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(commit.authoredAt)}</span>
                        </span>
                        {commit.renamedFrom && (
                          <span className="mt-1 block truncate text-[8.5px] text-azure/65">
                            重命名自 {commit.renamedFrom}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[8.5px] text-muted-foreground/35">
          <span>
            {history.error && history.commits.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-rose/65">
                {history.error.message}
                <button
                  type="button"
                  onClick={history.retry}
                  className="underline underline-offset-2"
                >
                  重试
                </button>
              </span>
            ) : (
              "每页 100 条 · 滚动加载"
            )}
          </span>
          <span className="truncate">{filePath ? fileName(filePath) : ""}</span>
        </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
