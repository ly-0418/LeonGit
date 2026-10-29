import { GitBranch, Loader2, TriangleAlert } from "lucide-react";

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

interface BranchDeleteDialogProps {
  branch: BranchInfo | null;
  isBusy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function BranchDeleteDialog({
  branch,
  isBusy,
  onOpenChange,
  onConfirm,
}: BranchDeleteDialogProps) {
  const unmerged = Boolean(branch && !branch.isMerged);

  return (
    <Dialog
      open={Boolean(branch)}
      onOpenChange={(next) => {
        if (!isBusy) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!isBusy} className="max-w-[480px]">
        <DialogHeader>
          <div
            className={`grid size-9 place-items-center rounded-xl border ${
              unmerged
                ? "border-rose/20 bg-rose/[0.07] text-rose/80"
                : "border-[var(--line)] bg-[var(--surface-muted)] text-muted-foreground/55"
            }`}
          >
            <GitBranch className="size-4" />
          </div>
          <DialogTitle>
            {unmerged ? "删除未合并分支？" : "删除本地分支？"}
          </DialogTitle>
          <DialogDescription>
            {unmerged
              ? "该分支包含尚未合并到当前 HEAD 的提交。删除后这些提交可能只能通过 reflog 找回。"
              : "该分支已合并到当前 HEAD，可以安全删除。"}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2">
          <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--well)] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <GitBranch className="size-3.5 text-brand/60" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
                {branch?.name}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground/35">
                {branch?.shortOid}
              </span>
            </div>
            {branch?.upstream && (
              <div className="font-mono text-[9px] text-muted-foreground/35">
                upstream: {branch.upstream}
              </div>
            )}
          </div>

          {unmerged && (
            <div className="flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.055] px-3 py-2.5 text-[9px] leading-relaxed text-rose/70">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              这是不可撤销的本地分支引用删除。确认前请先确认提交已推送到远程或不再需要。
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            取消
          </Button>
          <Button
            variant={unmerged ? "destructive" : "secondary"}
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? (
              <Loader2 className="animate-spin" />
            ) : (
              <TriangleAlert />
            )}
            {isBusy
              ? "正在删除…"
              : unmerged
                ? "仍然删除未合并分支"
                : "删除分支"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
