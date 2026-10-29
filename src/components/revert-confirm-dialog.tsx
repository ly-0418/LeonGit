import { Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

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

interface RevertConfirmDialogProps {
  sha: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean>;
}

export function RevertConfirmDialog({
  sha,
  onOpenChange,
  onConfirm,
}: RevertConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsSubmitting(false);
  }, [sha]);

  const submit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const success = await onConfirm();
    setIsSubmitting(false);
    if (success) onOpenChange(false);
  };

  return (
    <Dialog
      open={Boolean(sha)}
      onOpenChange={(next) => {
        if (!isSubmitting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-[var(--warning-border)] bg-[var(--warning-surface)] text-[var(--warning)]">
            <RotateCcw className="size-4" />
          </div>
          <DialogTitle>Revert 这个提交？</DialogTitle>
          <DialogDescription className="font-mono">{sha}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex items-start gap-2 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-3 py-2.5 text-[10px] leading-relaxed text-[var(--warning)]">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            将创建一个反向提交；如果产生冲突，会进入“revert 进行中”，不会自动 continue 或 abort。
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
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            {isSubmitting ? "正在 Revert…" : "确认 Revert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
