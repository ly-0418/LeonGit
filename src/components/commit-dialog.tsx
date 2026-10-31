import {
  Check,
  GitCommitHorizontal,
  GripVertical,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { DiffLines } from "@/components/diff-lines";
import { CommitMessagePicker } from "@/components/commit-message-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  commitStaged,
  getStagedDiffs,
  toGitError,
  type CommitAuthor,
} from "@/lib/git-api";
import { changeBadgeClass, CHANGE_LABELS } from "@/lib/changes";
import { formatCount } from "@/lib/format";
import { repoStateInfo } from "@/lib/repo-state";
import type {
  CommitDetail,
  CommitPushResult,
  CommitResult,
  FileDiff,
  GitError,
  RepositorySnapshot,
} from "@/types/git";

interface CommitDialogProps {
  open: boolean;
  snapshot: RepositorySnapshot;
  initialMessage?: string | null;
  onOpenChange: (open: boolean) => void;
  onCommitted: (result: CommitResult) => void;
  onOpenRepositorySettings: () => void;
  onCreateDetachedBranch: () => void;
  onCommitAndPush: (
    title: string,
    body: string,
    author: CommitAuthor | null,
    noVerify: boolean,
  ) => Promise<CommitPushResult>;
}

const STAGED_DIFF_PAGE_SIZE = 12;
const MIN_LEFT_PANE = 240;
const MIN_RIGHT_PANE = 280;
const DEFAULT_LEFT_PANE = 380;

export function CommitDialog({
  open,
  snapshot,
  initialMessage,
  onOpenChange,
  onCommitted,
  onOpenRepositorySettings,
  onCreateDetachedBranch,
  onCommitAndPush,
}: CommitDialogProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reusedAuthor, setReusedAuthor] = useState<CommitAuthor | null>(null);
  const [reuseAuthor, setReuseAuthor] = useState(false);
  const [reusedCommit, setReusedCommit] = useState<CommitDetail | null>(null);
  const [messagePickerOpen, setMessagePickerOpen] = useState(false);
  const [noVerify, setNoVerify] = useState(false);
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreDiffs, setHasMoreDiffs] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [diffError, setDiffError] = useState<GitError | null>(null);
  const [moreError, setMoreError] = useState<GitError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [leftPaneWidth, setLeftPaneWidth] = useState(DEFAULT_LEFT_PANE);
  const splitRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    startX: number;
    startWidth: number;
    maxWidth: number;
  } | null>(null);

  const stagedFiles = snapshot.files.staged;
  // Keyed by the staged file set, not just its size: unstaging one file and
  // staging another keeps the length constant but changes the diff.
  const stagedSignature = stagedFiles
    .map((file) => `${file.path}:${file.change}:${file.originalPath ?? ""}`)
    .join("\u0001");
  const stateInfo = repoStateInfo(snapshot.repoState);
  const stagedEmpty = stagedFiles.length === 0;
  const titleEmpty = title.trim().length === 0;
  const canSubmit =
    !titleEmpty &&
    !stagedEmpty &&
    !isSubmitting &&
    !stateInfo.blocksCommit;
  const validationMessage = stagedEmpty
    ? "没有已暂存的变更"
    : titleEmpty
      ? "提交消息不能为空"
      : stateInfo.blocksCommit
        ? `当前${stateInfo.label}，不能创建普通提交`
        : null;

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const message = initialMessage?.trim() ?? "";
    const [initialTitle, ...initialBody] = message.split("\n");
    setTitle(initialTitle ?? "");
    setBody(initialBody.join("\n").trim());
    setReusedAuthor(null);
    setReuseAuthor(false);
    setReusedCommit(null);
    setMessagePickerOpen(false);
    setNoVerify(false);
    setError(null);
    setDiffError(null);
    setMoreError(null);
    setDiffs([]);
    setHasMoreDiffs(false);
    setIsLoading(true);

    void getStagedDiffs(snapshot.path, 0, STAGED_DIFF_PAGE_SIZE)
      .then((next) => {
        if (!cancelled) {
          setDiffs(next);
          setHasMoreDiffs(
            next.length > 0 && next.length < stagedFiles.length,
          );
        }
      })
      .catch((rawError: unknown) => {
        if (!cancelled) {
          setDiffError(toGitError(rawError));
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
  }, [initialMessage, open, reloadToken, snapshot.path, stagedSignature]);

  const loadMoreDiffs = async () => {
    if (isLoadingMore || !hasMoreDiffs) {
      return;
    }
    setIsLoadingMore(true);
    setMoreError(null);
    const offset = diffs.length;
    try {
      const next = await getStagedDiffs(
        snapshot.path,
        offset,
        STAGED_DIFF_PAGE_SIZE,
      );
      setDiffs((current) => [...current, ...next]);
      setHasMoreDiffs(
        next.length > 0 && offset + next.length < stagedFiles.length,
      );
    } catch (rawError) {
      setMoreError(toGitError(rawError));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const clampLeftPane = (value: number, total?: number) => {
    const available = total ?? splitRef.current?.clientWidth ?? 900;
    const max = Math.max(MIN_LEFT_PANE, available - MIN_RIGHT_PANE);
    return Math.max(MIN_LEFT_PANE, Math.min(value, max));
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const split = splitRef.current;
    if (!split) {
      return;
    }
    const clamp = () =>
      setLeftPaneWidth((current) => clampLeftPane(current, split.clientWidth));
    clamp();
    const observer = new ResizeObserver(clamp);
    observer.observe(split);
    return () => observer.disconnect();
  }, [open]);

  const handleResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const total = splitRef.current?.clientWidth ?? 900;
    resizeRef.current = {
      startX: event.clientX,
      startWidth: leftPaneWidth,
      maxWidth: Math.max(MIN_LEFT_PANE, total - MIN_RIGHT_PANE),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize) {
      return;
    }
    const next = resize.startWidth + event.clientX - resize.startX;
    setLeftPaneWidth(
      Math.max(MIN_LEFT_PANE, Math.min(resize.maxWidth, next)),
    );
  };

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -16 : 16;
    setLeftPaneWidth((current) => clampLeftPane(current + delta));
  };

  const changeByPath = useMemo(() => {
    const map = new Map<string, (typeof stagedFiles)[number]>();
    for (const file of stagedFiles) {
      map.set(file.path, file);
    }
    return map;
  }, [stagedFiles]);

  const authorOverride =
    reuseAuthor && reusedAuthor ? reusedAuthor : null;

  const handleReuseMessage = (detail: CommitDetail) => {
    const message = detail.message.replace(/\r\n/g, "\n").replace(/\s+$/, "");
    const [subject = "", ...rest] = message.split("\n");
    setTitle(subject);
    setBody(rest.join("\n").replace(/^\n+/, ""));
    setReusedAuthor({
      name: detail.authorName,
      email: detail.authorEmail,
    });
    setReusedCommit(detail);
    setReuseAuthor(false);
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await commitStaged(
        snapshot.path,
        title,
        body,
        authorOverride,
        noVerify,
      );
      onCommitted(result);
      onOpenChange(false);
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleCommitAndPush = async () => {
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onCommitAndPush(title, body, authorOverride, noVerify);
      onOpenChange(false);
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key === "Enter"
    ) {
      event.preventDefault();
      if (!canSubmit) {
        if (titleEmpty) {
          document.getElementById("commit-title")?.focus();
        }
        return;
      }
      void handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isSubmitting}
        className="h-[min(86vh,780px)] max-h-[90vh] max-w-[1200px] gap-3"
      >
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <GitCommitHorizontal className="size-4" />
          </div>
          <DialogTitle>提交已暂存变更</DialogTitle>
          <DialogDescription>
            只提交当前暂存区中的 {formatCount(stagedFiles.length)} 个文件。
            右侧为已暂存 diff（文件较多时按需加载）；普通提交不会 push，Amend 请使用工作区的次级入口。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <div ref={splitRef} className="flex min-h-0 flex-1 overflow-hidden">
            <div
              style={{ width: leftPaneWidth }}
              className="min-h-0 shrink-0 overflow-y-auto pr-4"
            >
              <div className="space-y-3">
          {snapshot.repoState !== "normal" && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-3 py-2.5 text-[9.5px] leading-relaxed text-[var(--warning)]">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <div className="font-medium">{stateInfo.label}</div>
                <p className="mt-0.5 opacity-80">{stateInfo.description}</p>
                {snapshot.head.detached && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2 h-6 px-2 text-[8.5px]"
                    onClick={onCreateDetachedBranch}
                  >
                    创建新分支保存提交
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label
              htmlFor="commit-title"
              className="text-[10px] font-medium text-foreground/65"
            >
              提交标题
            </label>
            <Input
              id="commit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：feat: 完成整文件暂存与提交"
              maxLength={200}
              disabled={isSubmitting}
              autoFocus
            />
            <div
              className={`flex items-center gap-1.5 text-[8.5px] leading-relaxed ${
                titleEmpty
                  ? "text-rose/65"
                  : "text-muted-foreground/40"
              }`}
            >
              {titleEmpty ? (
                <>
                  <TriangleAlert className="size-3 shrink-0" />
                  提交消息不能为空
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3 shrink-0 text-jade/50" />
                  仅写入本地仓库 · 检查右侧 diff 后提交
                </>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="commit-body"
              className="text-[10px] font-medium text-foreground/65"
            >
              正文 <span className="font-normal text-muted-foreground/30">可选</span>
            </label>
            <Textarea
              id="commit-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="补充这次变更的背景、取舍或验证方式…"
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[9px]"
              onClick={() => setMessagePickerOpen(true)}
              disabled={isSubmitting}
            >
              从历史复用消息
            </Button>
            {reusedCommit && (
              <span className="truncate font-mono text-[8.5px] text-muted-foreground/40">
                已复用 {reusedCommit.shortOid} · {reusedCommit.subject}
              </span>
            )}
          </div>

          {reusedAuthor && (
            <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2 text-[9.5px] text-foreground/65">
              <input
                type="checkbox"
                checked={reuseAuthor}
                onChange={(event) => setReuseAuthor(event.target.checked)}
                disabled={isSubmitting}
                className="size-3 accent-[var(--brand)]"
              />
              同时复用作者信息
              <span className="text-muted-foreground/40">
                {reusedAuthor.name} &lt;{reusedAuthor.email}&gt;
              </span>
            </label>
          )}

          <details className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2">
            <summary className="cursor-pointer text-[9px] text-muted-foreground/45 outline-none">
              更多
            </summary>
            <label className="mt-2 flex items-start gap-2 text-[9.5px] text-foreground/60">
              <input
                type="checkbox"
                checked={noVerify}
                onChange={(event) => setNoVerify(event.target.checked)}
                disabled={isSubmitting}
                className="mt-0.5 size-3 accent-amber-500"
              />
              跳过 Git 钩子
            </label>
            {noVerify && (
              <div className="mt-2 rounded-md border border-[var(--warning-border)] bg-[var(--warning-surface)] px-2 py-1.5 text-[9px] leading-relaxed text-[var(--warning)]">
                将跳过 pre-commit 和 commit-msg 钩子，可能绕过代码检查
              </div>
            )}
          </details>

          <CommitMessagePicker
            open={messagePickerOpen}
            repoPath={snapshot.path}
            onOpenChange={setMessagePickerOpen}
            onSelected={handleReuseMessage}
          />
              </div>
            </div>

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整提交信息与 diff 宽度"
              tabIndex={0}
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={finishResize}
              onPointerCancel={finishResize}
              onKeyDown={handleResizeKeyDown}
              title="拖动调整左右宽度"
              className="group relative mx-1 w-2 shrink-0 cursor-col-resize rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/35"
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--line)] transition-colors group-hover:bg-brand/40" />
              <span className="pointer-events-none absolute left-1/2 top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-popover)] text-muted-foreground/40 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <GripVertical className="size-3" />
              </span>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-foreground/60">
                完整 diff（暂存区 → HEAD）
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[8.5px] text-muted-foreground/30">
                  {formatCount(diffs.length)} /{" "}
                  {formatCount(stagedFiles.length)} files
                </span>
                {hasMoreDiffs && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[8.5px]"
                    onClick={() => void loadMoreDiffs()}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore && <Loader2 className="animate-spin" />}
                    {moreError
                      ? "重试"
                      : isLoadingMore
                        ? "加载中…"
                        : "加载更多"}
                  </Button>
                )}
              </div>
            </div>

            {moreError && (
              <div className="mb-1.5 flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.055] px-3 py-2 text-[9px] leading-relaxed text-rose/75">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                {moreError.message}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface-deep)]">
              {isLoading ? (
                <div className="space-y-2 p-4" role="status">
                  {Array.from({ length: 8 }, (_, index) => (
                    <div
                      key={index}
                      className="h-2.5 animate-pulse rounded bg-[var(--surface-muted)]"
                      style={{ width: `${36 + ((index * 17) % 54)}%` }}
                    />
                  ))}
                </div>
              ) : diffError ? (
                <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
                  <TriangleAlert className="size-4 text-rose/65" />
                  <div className="text-[10px] text-rose/70">
                    {diffError.message}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setReloadToken((token) => token + 1)}
                  >
                    重试加载 diff
                  </Button>
                </div>
              ) : diffs.length === 0 ? (
                <div className="px-5 py-10 text-center text-[10px] text-muted-foreground/35">
                  暂存区没有可提交的 diff。
                </div>
              ) : (
                diffs.map((diff) => {
                  const status = changeByPath.get(diff.path);
                  return (
                    <section
                      key={`${diff.path}:${diff.originalPath ?? ""}`}
                      className="border-t border-[var(--line-subtle)] first:border-t-0"
                    >
                      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--line-subtle)] bg-[var(--surface-popover)] px-3 py-2 backdrop-blur-sm">
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/70">
                          {diff.path}
                          {diff.originalPath ? `  ←  ${diff.originalPath}` : ""}
                        </span>
                        {status && (
                          <span
                            className={`shrink-0 rounded-[4px] border px-1 py-px text-[8px] leading-none ${changeBadgeClass(status.change)}`}
                          >
                            {CHANGE_LABELS[status.change]}
                          </span>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <DiffLines
                          lines={diff.lines}
                          isBinary={diff.isBinary}
                          truncated={diff.truncated}
                          totalLines={diff.totalLines}
                          hasInvalidUtf8={diff.hasInvalidUtf8}
                        />
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex shrink-0 flex-col gap-2 rounded-lg border border-rose/15 bg-rose/[0.055] px-3 py-2.5 text-[10px] leading-relaxed text-rose/80"
            >
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{error.message}</span>
              </div>
              {error.kind === "identityMissing" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    setError(null);
                    onOpenRepositorySettings();
                  }}
                >
                  打开仓库配置
                </Button>
              )}
            </div>
          )}

          {!isSubmitting && (stagedEmpty || stateInfo.blocksCommit) && (
            <div
              role="status"
              className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.045] px-3 py-2 text-[9.5px] text-amber-700/75 dark:text-amber-300/70"
            >
              <TriangleAlert className="size-3.5 shrink-0" />
              {validationMessage}
            </div>
          )}

          <DialogFooter className="border-t-0 pt-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleCommitAndPush()}
              disabled={!canSubmit}
              title="先创建本地提交，再 push；push 失败不会回滚提交"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              提交并推送
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Check />
              )}
              {isSubmitting ? "正在提交…" : "提交到本地仓库"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
