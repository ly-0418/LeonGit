import { Loader2, Upload, TriangleAlert } from "lucide-react";

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
import type { RepositorySnapshot } from "@/types/git";

interface PushConfirmDialogProps {
  open: boolean;
  snapshot: RepositorySnapshot;
  isPushing: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function PushConfirmDialog({
  open,
  snapshot,
  isPushing,
  onOpenChange,
  onConfirm,
}: PushConfirmDialogProps) {
  const branch = snapshot.head.branch ?? "HEAD";
  const upstream = snapshot.head.upstream;
  const target = upstream ?? `origin/${branch}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPushing) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!isPushing} className="max-w-[460px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-azure/15 bg-azure/[0.055] text-azure/75">
            <Upload className="size-4" />
          </div>
          <DialogTitle>推送当前分支？</DialogTitle>
          <DialogDescription>
            推送是一次远程写入操作，需要你明确确认。不会执行 force push。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--well)] px-3 py-3">
            <div className="flex items-center gap-2 font-mono text-[11px] text-foreground/80">
              <span className="text-brand/60">{branch}</span>
              <span className="text-muted-foreground/30">→</span>
              <span className="text-azure/70">{target}</span>
            </div>
            <div className="text-[9px] leading-relaxed text-muted-foreground/35">
              {upstream
                ? "使用已有 upstream。"
                : "当前分支还没有 upstream，本次将使用 origin 并设置上游。"}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-3 py-2.5 text-[9px] leading-relaxed text-[var(--warning)]">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            推送认证由系统 Git 凭据管理器处理，客户端不保存任何密码或 token。
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPushing}
          >
            取消
          </Button>
          <Button onClick={onConfirm} disabled={isPushing}>
            {isPushing ? <Loader2 className="animate-spin" /> : <Upload />}
            {isPushing ? "正在推送…" : "确认推送"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
