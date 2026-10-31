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

interface MergeAbortDialogProps {
  open: boolean;
  isAborting: boolean;
  title?: string;
  description?: string;
  note?: string;
  confirmLabel?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function MergeAbortDialog({
  open,
  isAborting,
  title = "中止当前 merge？",
  description = "将放弃本次 merge 的所有冲突解决进度，工作区恢复到 merge 之前。",
  note = "中止后不会自动切换分支、自动 stash 或执行其他操作；工作区会直接回到 merge 之前。请确认没有尚未保存的解决结果。",
  confirmLabel = "确认中止 merge",
  onOpenChange,
  onConfirm,
}: MergeAbortDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isAborting) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!isAborting} className="max-w-[460px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-rose/20 bg-rose/[0.07] text-rose/80">
            <TriangleAlert className="size-4" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-lg border border-rose/15 bg-rose/[0.045] px-3 py-2.5 text-[9px] leading-relaxed text-rose/70">
            {note}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isAborting}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isAborting}
          >
            {isAborting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <TriangleAlert />
            )}
            {isAborting ? "正在中止…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
