import { Loader2, Tag, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

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
import { createTag, deleteTag, listTags, toGitError } from "@/lib/git-api";
import { formatRelativeTime } from "@/lib/format";
import type { GitError, TagEntry } from "@/types/git";

interface TagDialogProps {
  open: boolean;
  repoPath: string;
  headOid: string | null;
  onOpenChange: (open: boolean) => void;
}

export function TagDialog({
  open,
  repoPath,
  headOid,
  onOpenChange,
}: TagDialogProps) {
  const [tags, setTags] = useState<TagEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [name, setName] = useState("");
  const [targetSha, setTargetSha] = useState("");
  const [annotated, setAnnotated] = useState(true);
  const [message, setMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const reload = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setTags(await listTags(repoPath));
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setName("");
    setTargetSha(headOid ?? "");
    setAnnotated(true);
    setMessage("");
    setDeletingName(null);
    setStatus(null);
    setTags([]);
    void reload();
  }, [headOid, open, repoPath]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isCreating || !name.trim() || !targetSha.trim()) return;
    if (annotated && !message.trim()) {
      setError({
        kind: "invalidInput",
        message: "附注标签需要填写消息。",
      });
      return;
    }
    setIsCreating(true);
    setError(null);
    setStatus(null);
    try {
      const next = await createTag(
        repoPath,
        name.trim(),
        targetSha.trim(),
        annotated,
        message.trim() || null,
      );
      setTags(next);
      setName("");
      setMessage("");
      setStatus("标签已创建。标签仅存在于本地，不会自动推送。");
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDelete = async (tag: TagEntry) => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      setTags(await deleteTag(repoPath, tag.name));
      setDeletingName(null);
      setStatus(`标签 ${tag.name} 已删除；本地操作，不会影响远程。`);
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-[760px] gap-3">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <Tag className="size-4" />
          </div>
          <DialogTitle>标签</DialogTitle>
          <DialogDescription>
            标签只写入本地仓库，不会自动推送；本阶段不提供 push tag。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <form
            id="tag-form"
            onSubmit={submit}
            className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] p-3"
          >
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground/50">
                标签名
              </label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如 v1.0.0"
                spellCheck={false}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground/50">
                目标 commit SHA
              </label>
              <Input
                value={targetSha}
                onChange={(event) => setTargetSha(event.target.value)}
                placeholder="完整 40/64 位 SHA"
                spellCheck={false}
                disabled={isCreating}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[9px] text-foreground/65">
            <input
              type="checkbox"
              checked={annotated}
              onChange={(event) => setAnnotated(event.target.checked)}
              disabled={isCreating}
              className="size-3 accent-[var(--brand)]"
            />
            附注标签（默认）
          </label>

          {annotated && (
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="附注标签消息"
              rows={2}
              disabled={isCreating}
            />
          )}
        </form>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.05] px-3 py-2 text-[9.5px] leading-relaxed text-rose/75">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {error.message}
          </div>
        )}
        {status && (
          <div
            role="status"
            className="rounded-lg border border-jade/15 bg-jade/[0.05] px-3 py-2 text-[9.5px] text-jade/75"
          >
            {status}
          </div>
        )}

        <div className="rounded-xl border border-[var(--line)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/45">
              本地标签
            </span>
            <span className="font-mono text-[8px] text-muted-foreground/30">
              {tags.length}
            </span>
          </div>
          {isLoading ? (
            <div className="flex h-20 items-center justify-center gap-2 text-[9px] text-muted-foreground/40">
              <Loader2 className="size-3 animate-spin" />
              正在读取标签…
            </div>
          ) : tags.length === 0 ? (
            <div className="px-3 py-5 text-center text-[9px] text-muted-foreground/35">
              还没有本地标签。
            </div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto">
              {tags.map((tag) => (
                <div
                  key={tag.name}
                  className="flex items-center gap-2 border-b border-[var(--line-subtle)] px-3 py-2 last:border-b-0"
                >
                  <Tag className="size-3 shrink-0 text-brand/55" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-foreground/75">
                    {tag.name}
                  </span>
                  <span className="rounded border border-[var(--line)] px-1 py-px text-[7.5px] text-muted-foreground/45">
                    {tag.annotated ? "附注" : "轻量"}
                  </span>
                  <span className="font-mono text-[8px] text-muted-foreground/30">
                    {tag.targetSha.slice(0, 8)}
                  </span>
                  <span className="w-[70px] shrink-0 text-right text-[8px] text-muted-foreground/30">
                    {formatRelativeTime(tag.timestamp)}
                  </span>
                  {deletingName === tag.name ? (
                    <>
                      <span className="text-[8px] text-rose/65">确认删除？</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[8px] text-rose/75"
                        onClick={() => void confirmDelete(tag)}
                        disabled={isDeleting}
                      >
                        删除
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[8px]"
                        onClick={() => setDeletingName(null)}
                        disabled={isDeleting}
                      >
                        取消
                      </Button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeletingName(tag.name)}
                      aria-label={`删除标签 ${tag.name}`}
                      className="grid size-6 place-items-center rounded text-muted-foreground/25 hover:bg-rose/[0.06] hover:text-rose/65"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-[8.5px] text-muted-foreground/35">
          附注与轻量标签均只存在本地；删除需要二次确认，不支持批量删除。
        </div>
        </DialogBody>

        <DialogFooter className="border-t-0 pt-0">
          <span className="mr-auto text-[8.5px] text-muted-foreground/35">
            创建后仅影响本地 refs/tags。
          </span>
          <Button
            type="submit"
            form="tag-form"
            size="sm"
            disabled={
              isCreating ||
              !name.trim() ||
              !targetSha.trim() ||
              (annotated && !message.trim())
            }
          >
            {isCreating ? <Loader2 className="animate-spin" /> : <Tag />}
            {isCreating ? "正在创建…" : "创建标签"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
