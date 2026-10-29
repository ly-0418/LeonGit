import { Loader2, PencilLine, TriangleAlert } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { RepositorySnapshot } from "@/types/git";

interface AmendCommitDialogProps {
  open: boolean;
  snapshot: RepositorySnapshot;
  onOpenChange: (open: boolean) => void;
  onConfirm: (message: string | null, includeStaged: boolean) => Promise<boolean>;
}

export function AmendCommitDialog({
  open,
  snapshot,
  onOpenChange,
  onConfirm,
}: AmendCommitDialogProps) {
  const [message, setMessage] = useState("");
  const [includeStaged, setIncludeStaged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMessage("");
      setIncludeStaged(snapshot.workingTree.staged > 0);
      setIsSubmitting(false);
    }
  }, [open, snapshot.workingTree.staged]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const success = await onConfirm(
      message.trim() || null,
      includeStaged,
    );
    setIsSubmitting(false);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-[var(--warning-border)] bg-[var(--warning-surface)] text-[var(--warning)]">
            <PencilLine className="size-4" />
          </div>
          <DialogTitle>Amend 最近一次提交</DialogTitle>
          <DialogDescription>
            会改写最近一次提交的历史。留空消息表示保持原提交消息；不会 push。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-3">
          <DialogBody className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-3 py-2 text-[10px] leading-relaxed text-[var(--warning)]">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              确认后会生成新的提交 SHA；请只在本地未共享的提交上使用。
            </div>

            <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-foreground/65">
              新提交消息（可选）
            </label>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="留空 = 保持最近一次提交消息"
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2 text-[10px] text-foreground/65">
            <input
              type="checkbox"
              checked={includeStaged}
              onChange={(event) => setIncludeStaged(event.target.checked)}
              disabled={isSubmitting || snapshot.workingTree.staged === 0}
              className="mt-0.5 size-3 accent-[var(--brand)]"
            />
            <span>
              包含当前暂存文件
              <span className="ml-1 text-muted-foreground/40">
                （{snapshot.workingTree.staged} 个）
              </span>
            </span>
          </label>

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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <PencilLine />
              )}
              {isSubmitting ? "正在 Amend…" : "确认改写最近提交"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
