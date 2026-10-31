import { GitBranch, TriangleAlert } from "lucide-react";

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

interface DetachedSwitchDialogProps {
  branch: BranchInfo | null;
  currentSha: string | null;
  onOpenChange: (open: boolean) => void;
  onCreateBranch: () => void;
  onSwitchAnyway: () => void;
}

export function DetachedSwitchDialog({
  branch,
  currentSha,
  onOpenChange,
  onCreateBranch,
  onSwitchAnyway,
}: DetachedSwitchDialogProps) {
  if (!branch) {
    return null;
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-amber-500/20 bg-amber-500/[0.06] text-amber-600">
            <TriangleAlert className="size-4" />
          </div>
          <DialogTitle>有游离 commit 未关联分支</DialogTitle>
          <DialogDescription>
            当前 detached HEAD 的提交 {currentSha ?? ""} 尚未关联任何本地分支。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.055] px-3 py-2.5 text-[10px] leading-relaxed text-amber-700/85 dark:text-amber-300/80">
            是否先创建分支保存该提交，再切换到 <span className="font-mono">{branch.name}</span>？
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[9px] leading-relaxed text-muted-foreground/55">
            如果仍然切换，该游离 commit 会失去分支引用；仍可通过 reflog 找回，但不建议忽略。
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type="button" variant="secondary" onClick={onSwitchAnyway}>
            仍然切换
          </Button>
          <Button type="button" onClick={onCreateBranch}>
            <GitBranch />
            创建分支保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
