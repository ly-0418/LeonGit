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
  onConfirmSquash: () => Promise<boolean>;
}

export function MergeBranchDialog({
  branch,
  currentBranch,
  onOpenChange,
  onConfirm,
  onConfirmSquash,
}: MergeBranchDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeMode, setActiveMode] = useState<"merge" | "squash" | null>(
    null,
  );

  const submit = async (mode: "merge" | "squash") => {
    if (!branch || isSubmitting) return;
    setActiveMode(mode);
    setIsSubmitting(true);
    const success =
      mode === "squash" ? await onConfirmSquash() : await onConfirm();
    setIsSubmitting(false);
    setActiveMode(null);
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
            普通合并执行 `git merge --no-edit`；Squash 合并执行
            `git merge --squash`，只暂存变更，不自动提交。
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

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.055] px-3 py-2 text-[9.5px] leading-relaxed text-amber-700/85 dark:text-amber-300/80">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            Squash merge 不记录合并关系，后续重复 squash
            可能需要重新解决冲突；长期分支建议使用普通合并。
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
            variant="secondary"
            onClick={() => void submit("merge")}
            disabled={isSubmitting || !branch || !currentBranch}
          >
            {isSubmitting && activeMode === "merge" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <GitMerge />
            )}
            {isSubmitting && activeMode === "merge" ? "正在合并…" : "普通合并"}
          </Button>
          <Button
            type="button"
            onClick={() => void submit("squash")}
            disabled={isSubmitting || !branch || !currentBranch}
          >
            {isSubmitting && activeMode === "squash" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <GitMerge />
            )}
            {isSubmitting && activeMode === "squash"
              ? "正在 Squash…"
              : "Squash 合并"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
