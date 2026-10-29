import {
  Check,
  GitCommitHorizontal,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { DiffLines } from "@/components/diff-lines";
import { CommitMessagePicker } from "@/components/commit-message-picker";
import {
  Dialog,
  DialogBody,
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
  onOpenChange: (open: boolean) => void;
  onCommitted: (result: CommitResult) => void;
  onCommitAndPush: (
    title: string,
    body: string,
    author: CommitAuthor | null,
    noVerify: boolean,
  ) => Promise<CommitPushResult>;
}

export function CommitDialog({
  open,
  snapshot,
  onOpenChange,
  onCommitted,
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [diffError, setDiffError] = useState<GitError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const stagedFiles = snapshot.files.staged;
  const canSubmit =
    title.trim().length > 0 &&
    stagedFiles.length > 0 &&
    !isLoading &&
    !isSubmitting &&
    !diffError;

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setTitle("");
    setBody("");
    setReusedAuthor(null);
    setReuseAuthor(false);
    setReusedCommit(null);
    setMessagePickerOpen(false);
    setNoVerify(false);
    setError(null);
    setDiffError(null);
    setDiffs([]);
    setIsLoading(true);

    void getStagedDiffs(snapshot.path)
      .then((next) => {
        if (!cancelled) {
          setDiffs(next);
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
  }, [open, reloadToken, snapshot.path]);

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isSubmitting}
        className="max-h-[90vh] max-w-[900px] gap-3"
      >
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <GitCommitHorizontal className="size-4" />
          </div>
          <DialogTitle>提交已暂存变更</DialogTitle>
          <DialogDescription>
            只提交当前暂存区中的 {formatCount(stagedFiles.length)} 个文件。
            提交前请检查下方完整 diff；普通提交不会 push，Amend 请使用工作区的次级入口。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
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
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
                <ShieldCheck className="size-3 text-jade/50" />
                仅写入本地仓库
              </div>
              <div className="text-[9px] leading-relaxed text-muted-foreground/35">
                检查完整 diff 后点击“提交”按钮。
              </div>
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

          <div className="min-h-0">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium text-foreground/60">
                完整 diff（暂存区 → HEAD）
              </span>
              <span className="font-mono text-[8.5px] text-muted-foreground/30">
                {formatCount(stagedFiles.length)} files
              </span>
            </div>

            <div className="max-h-[38vh] min-h-[150px] overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface-deep)]">
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
                        />
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.055] px-3 py-2.5 text-[10px] leading-relaxed text-rose/80">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {error.message}
            </div>
          )}
          </DialogBody>

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
