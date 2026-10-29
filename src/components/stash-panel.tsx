import { Archive, Check, ChevronDown, ChevronRight, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  stashApply,
  stashDrop,
  stashList,
  stashPop,
  stashPush,
  toGitError,
} from "@/lib/git-api";
import { formatRelativeTime } from "@/lib/format";
import type { GitError, StashEntry } from "@/types/git";

interface StashPanelProps {
  repoPath: string;
  onChanged: () => void;
  onError: (error: unknown) => void;
}

export function StashPanel({ repoPath, onChanged, onError }: StashPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<StashEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [restoreIndex, setRestoreIndex] = useState(true);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const repoRef = useRef(repoPath);

  useEffect(() => {
    repoRef.current = repoPath;
  }, [repoPath]);

  const reload = async () => {
    const target = repoPath;
    setIsLoading(true);
    setError(null);
    try {
      const next = await stashList(target);
      if (repoRef.current === target) {
        setEntries(next);
      }
    } catch (rawError) {
      if (repoRef.current === target) {
        setError(toGitError(rawError));
      }
    } finally {
      if (repoRef.current === target) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    setEntries([]);
    setError(null);
    setDropTarget(null);
    setIsBusy(false);
    setIsLoading(true);
    void reload();
  }, [repoPath]);

  useEffect(() => {
    if (expanded) {
      void reload();
    }
  }, [expanded]);

  const run = async (action: () => Promise<void>) => {
    if (isBusy) {
      return;
    }
    const target = repoPath;
    setIsBusy(true);
    try {
      await action();
      await reload();
      if (repoRef.current === target) {
        onChanged();
      }
    } catch (rawError) {
      onError(rawError);
      await reload();
      if (repoRef.current === target) {
        onChanged();
      }
    } finally {
      if (repoRef.current === target) {
        setIsBusy(false);
      }
    }
  };

  const submitPush = async () => {
    await run(async () => {
      await stashPush(repoPath, message.trim() || null, includeUntracked);
      setMessage("");
    });
  };

  return (
    <section className="shrink-0 border-t border-[var(--line)] bg-[var(--surface-app)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-5 py-2 text-left outline-none transition-colors hover:bg-[var(--surface-subtle)] focus-visible:ring-1 focus-visible:ring-brand/25"
      >
        <Archive className="size-3.5 text-muted-foreground/40" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/50">
          Stash
        </span>
        <span className="font-mono text-[8px] text-muted-foreground/30">
          {entries.length}
        </span>
        <span className="ml-auto text-[8px] text-muted-foreground/30">
          {expanded ? "收起" : "展开"}
        </span>
        {expanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground/35" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground/35" />
        )}
      </button>

      {expanded && (
        <div className="max-h-[38vh] overflow-y-auto border-t border-[var(--line-subtle)] px-5 pb-4 pt-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Stash 说明（可选）"
              maxLength={200}
              disabled={isBusy}
              className="h-8 text-[10px]"
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 text-[10px]"
              onClick={() => void submitPush()}
              disabled={isBusy}
            >
              {isBusy ? <Loader2 className="animate-spin" /> : <Archive />}
              保存 Stash
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[8.5px] text-muted-foreground/45">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={includeUntracked}
                onChange={(event) => setIncludeUntracked(event.target.checked)}
                disabled={isBusy}
                className="size-3 accent-[var(--brand)]"
              />
              包含未跟踪文件
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={restoreIndex}
                onChange={(event) => setRestoreIndex(event.target.checked)}
                disabled={isBusy}
                className="size-3 accent-[var(--brand)]"
              />
              恢复索引状态（--index）
            </label>
          </div>

          <div className="mt-3">
            {isLoading ? (
              <div className="flex h-10 items-center justify-center gap-2 text-[9px] text-muted-foreground/40">
                <Loader2 className="size-3 animate-spin" />
                正在读取 Stash…
              </div>
            ) : error ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-rose/10 bg-rose/[0.035] px-2.5 py-2 text-[9px] text-rose/65">
                <span className="min-w-0 truncate">{error.message}</span>
                <button
                  type="button"
                  onClick={() => void reload()}
                  className="shrink-0 underline underline-offset-2"
                >
                  重试
                </button>
              </div>
            ) : entries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--line-subtle)] px-2.5 py-2 text-[8.5px] text-muted-foreground/30">
                还没有 Stash 条目。
              </div>
            ) : (
              <div className="space-y-1">
                {entries.map((entry) => (
                  <div
                    key={entry.selector}
                    className="rounded-lg border border-[var(--line-subtle)] bg-[var(--surface-subtle)] px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[8px] text-brand/65">
                        {entry.selector}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[9.5px] text-foreground/70">
                        {entry.message || "（无说明）"}
                      </span>
                      <span className="shrink-0 text-[8px] text-muted-foreground/30">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="mr-auto font-mono text-[8px] text-muted-foreground/25">
                        {entry.shortOid}
                      </span>
                      {dropTarget === entry.index ? (
                        <>
                          <span className="text-[8.5px] text-rose/65">
                            确认删除？
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[8px] text-rose/70"
                            onClick={() => {
                              setDropTarget(null);
                              void run(() => stashDrop(repoPath, entry.index));
                            }}
                            disabled={isBusy}
                          >
                            删除
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[8px]"
                            onClick={() => setDropTarget(null)}
                            disabled={isBusy}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-1.5 text-[8px]"
                            onClick={() =>
                              void run(() =>
                                stashApply(repoPath, entry.index, restoreIndex),
                              )
                            }
                            disabled={isBusy}
                          >
                            <Upload className="size-2.5" />
                            应用
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-1.5 text-[8px]"
                            onClick={() =>
                              void run(() =>
                                stashPop(repoPath, entry.index, restoreIndex),
                              )
                            }
                            disabled={isBusy}
                          >
                            <Check className="size-2.5" />
                            弹出
                          </Button>
                          <button
                            type="button"
                            onClick={() => setDropTarget(entry.index)}
                            disabled={isBusy}
                            aria-label={`删除 ${entry.selector}`}
                            className="grid size-6 place-items-center rounded-md text-muted-foreground/25 hover:bg-rose/[0.06] hover:text-rose/65 disabled:opacity-40"
                          >
                            <Trash2 className="size-2.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
