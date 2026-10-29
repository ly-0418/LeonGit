import { Loader2, TriangleAlert } from "lucide-react";

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
import type { StatusFile } from "@/types/git";

interface DiscardDialogProps {
  file: StatusFile | null;
  isBusy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DiscardDialog({
  file,
  isBusy,
  onOpenChange,
  onConfirm,
}: DiscardDialogProps) {
  return (
    <Dialog
      open={Boolean(file)}
      onOpenChange={(nextOpen) => {
        if (!isBusy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent showCloseButton={!isBusy} className="max-w-[460px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-rose/20 bg-rose/[0.07] text-rose/80">
            <TriangleAlert className="size-4" />
          </div>
          <DialogTitle>丢弃未暂存修改？</DialogTitle>
          <DialogDescription>
            文件在工作区中的修改会被恢复为暂存区版本，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--well)] px-3 py-2.5">
            <div className="break-all font-mono text-[11px] text-foreground/75">
              {file?.path}
            </div>
            {file?.originalPath && (
              <div className="mt-1 break-all font-mono text-[9px] text-muted-foreground/35">
                原路径：{file.originalPath}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-rose/10 bg-rose/[0.035] px-3 py-2.5 text-[9px] leading-relaxed text-rose/65">
            不会影响已暂存内容；如果要撤销暂存，请使用“取消暂存”。
          </div>
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
            variant="destructive"
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? (
              <Loader2 className="animate-spin" />
            ) : (
              <TriangleAlert />
            )}
            {isBusy ? "正在丢弃…" : "丢弃修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
