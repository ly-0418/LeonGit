import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, RotateCw, UserRound, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { blameFile, readFileLines, toGitError } from "@/lib/git-api";
import { formatRelativeTime } from "@/lib/format";
import type { BlameLineMeta, GitError } from "@/types/git";

interface BlameDialogProps {
  open: boolean;
  repoPath: string;
  filePath: string | null;
  onOpenChange: (open: boolean) => void;
  onOpenCommit: (oid: string) => void;
}

const ROW_HEIGHT = 27;

export function BlameDialog({
  open,
  repoPath,
  filePath,
  onOpenChange,
  onOpenCommit,
}: BlameDialogProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [blame, setBlame] = useState<BlameLineMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    if (!open || !filePath) {
      setLines([]);
      setBlame([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    requestSequence.current += 1;
    const requestId = requestSequence.current;
    setIsLoading(true);
    setError(null);
    setLines([]);
    setBlame([]);

    void Promise.all([
      readFileLines(repoPath, filePath),
      blameFile(repoPath, filePath),
    ])
      .then(([nextLines, nextBlame]) => {
        if (requestId === requestSequence.current) {
          setLines(nextLines);
          setBlame(nextBlame);
        }
      })
      .catch((rawError: unknown) => {
        if (requestId === requestSequence.current) {
          setError(toGitError(rawError));
        }
      })
      .finally(() => {
        if (requestId === requestSequence.current) {
          setIsLoading(false);
        }
      });

    return () => {
      requestSequence.current += 1;
    };
  }, [filePath, open, reloadToken, repoPath]);

  const metaByLine = useMemo(() => {
    const result = new Array<BlameLineMeta | null>(lines.length).fill(null);
    for (const meta of blame) {
      for (
        let line = meta.startLine;
        line < meta.startLine + meta.lineCount && line <= result.length;
        line += 1
      ) {
        result[line - 1] = meta;
      }
    }
    return result;
  }, [blame, lines.length]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 30,
  });

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [filePath, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-[1040px] gap-3 overflow-hidden">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <UserRound className="size-4" />
          </div>
          <DialogTitle>文件 Blame</DialogTitle>
          <DialogDescription className="truncate font-mono">
            {filePath ?? "未选择文件"} · 点击行归属打开对应提交
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-[320px] flex-col">
          <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-deep)]">
          {isLoading ? (
            <div className="flex h-[420px] items-center justify-center gap-2 text-[11px] text-muted-foreground/45">
              <Loader2 className="size-4 animate-spin" />
              正在读取文件与 blame…
            </div>
          ) : error ? (
            <div className="flex h-[420px] flex-col items-center justify-center gap-3 px-6 text-center">
              <TriangleAlert className="size-5 text-rose/65" />
              <p className="max-w-[520px] text-[11px] leading-relaxed text-muted-foreground/55">
                {error.message}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                <RotateCw className="size-3.5" />
                重试
              </Button>
            </div>
          ) : lines.length === 0 ? (
            <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-center">
              <UserRound className="size-6 text-muted-foreground/25" />
              <div className="text-[12px] font-medium text-foreground/65">
                文件为空
              </div>
              <p className="text-[10px] text-muted-foreground/40">
                空文件没有可显示的 blame 行。
              </p>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="h-[min(62vh,560px)] overflow-auto overscroll-contain"
            >
              <div
                className="relative w-full min-w-[760px]"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const lineNumber = virtualRow.index + 1;
                  const content = lines[virtualRow.index] ?? "";
                  const meta = metaByLine[virtualRow.index];
                  return (
                    <button
                      key={virtualRow.key}
                      type="button"
                      onClick={() => meta && onOpenCommit(meta.sha)}
                      className="absolute left-0 top-0 flex w-full items-center border-b border-[var(--line-subtle)] text-left outline-none hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)]"
                      style={{
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <span className="w-12 shrink-0 border-r border-[var(--line-subtle)] px-2 text-right font-mono text-[8.5px] text-muted-foreground/30">
                        {lineNumber}
                      </span>
                      <span className="w-[190px] shrink-0 truncate border-r border-[var(--line-subtle)] px-2 font-mono text-[8px] text-muted-foreground/42">
                        {meta ? meta.sha.slice(0, 8) : "—"}
                      </span>
                      <span className="w-[125px] shrink-0 truncate border-r border-[var(--line-subtle)] px-2 text-[8.5px] text-foreground/55">
                        {meta?.author || "—"}
                      </span>
                      <span className="w-[88px] shrink-0 border-r border-[var(--line-subtle)] px-2 text-[8px] text-muted-foreground/35">
                        {meta ? formatRelativeTime(meta.time) : "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate px-2 font-mono text-[9.5px] text-foreground/70">
                        {content || " "}
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
            虚拟滚动 · 仅渲染可视行{lines.length > 2000 ? " · 大文件分段渲染" : ""}
          </span>
          <span>Rust 已聚合行范围，不传输完整 commit message</span>
        </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
