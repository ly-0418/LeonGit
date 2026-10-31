import { GitCommitHorizontal, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { commitEmpty, toGitError } from "@/lib/git-api";
import type { CommitResult, GitError } from "@/types/git";

interface EmptyCommitDialogProps {
  open: boolean;
  repoPath: string | null;
  onOpenChange: (open: boolean) => void;
  onCommitted: (result: CommitResult) => void;
}

export function EmptyCommitDialog({
  open,
  repoPath,
  onOpenChange,
  onCommitted,
}: EmptyCommitDialogProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle("");
    setBody("");
    setIsSubmitting(false);
    setError(null);
  }, [open]);

  const canSubmit = title.trim().length > 0 && !isSubmitting;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit || !repoPath) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await commitEmpty(repoPath, title, body);
      onCommitted(result);
      onOpenChange(false);
    } catch (rawError: unknown) {
      setError(toGitError(rawError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!isSubmitting} className="max-w-[500px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-amber-500/20 bg-amber-500/[0.06] text-amber-600">
            <GitCommitHorizontal className="size-4" />
          </div>
          <DialogTitle>创建空提交</DialogTitle>
          <DialogDescription>
            空提交不包含任何文件变更，仅用于触发 CI、标记节点等明确场景。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={submit}
          onKeyDown={handleKeyDown}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <DialogBody className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.055] px-3 py-2.5 text-[9.5px] leading-relaxed text-amber-700/85 dark:text-amber-300/80">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                这是次级显式入口。暂存区必须为空；如果存在已暂存变更，请关闭并使用普通提交。
                该操作仍需要明确确认，不会被主提交按钮静默触发。
              </span>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="empty-commit-title"
                className="text-[10px] font-medium text-foreground/65"
              >
                提交消息
              </label>
              <Input
                id="empty-commit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：chore: 触发 CI"
                maxLength={200}
                disabled={isSubmitting}
                autoFocus
              />
              {title.trim().length === 0 && (
                <p className="text-[8.5px] text-rose/65">提交消息不能为空</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="empty-commit-body"
                className="text-[10px] font-medium text-foreground/65"
              >
                正文 <span className="font-normal text-muted-foreground/30">可选</span>
              </label>
              <Textarea
                id="empty-commit-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="说明为什么需要一个空提交…"
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-rose/15 bg-rose/[0.05] px-3 py-2 text-[9.5px] leading-relaxed text-rose/75"
              >
                {error.message}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <GitCommitHorizontal />
              )}
              {isSubmitting ? "正在创建…" : "确认创建空提交"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
