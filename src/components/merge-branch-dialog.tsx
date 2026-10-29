import { GitMerge, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";

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
import type { BranchInfo } from "@/types/git";

interface MergeBranchDialogProps {
  branch: BranchInfo | null;
  currentBranch: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean>;
}

export function MergeBranchDialog({
  branch,
  currentBranch,
  onOpenChange,
  onConfirm,
}: MergeBranchDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (!branch || isSubmitting) return;
    setIsSubmitting(true);
    const success = await onConfirm();
    setIsSubmitting(false);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={Boolean(branch)}
      onOpenChange={(next) => {
        if (!isSubmitting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <GitMerge className="size-4" />
          </div>
          <DialogTitle>合并分支</DialogTitle>
          <DialogDescription>
            执行 `git merge --no-edit`，不会自动 stash、rebase 或 push。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-3 font-mono text-[10px]">
            <span className="truncate text-muted-foreground/60">{branch?.name}</span>
            <GitMerge className="size-3.5 shrink-0 text-brand/65" />
            <span className="truncate text-foreground/75">{currentBranch ?? "当前 HEAD"}</span>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-3 py-2 text-[10px] leading-relaxed text-[var(--warning)]">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            合并前要求工作区干净；如果产生冲突，会进入 V1 冲突状态，可用外部合并工具处理。
          </div>
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
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={isSubmitting || !branch || !currentBranch}
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <GitMerge />}
            {isSubmitting ? "正在合并…" : "确认合并"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
