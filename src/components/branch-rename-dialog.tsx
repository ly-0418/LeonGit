import { Check, Pencil } from "lucide-react";
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
import type { BranchInfo } from "@/types/git";

interface BranchRenameDialogProps {
  branch: BranchInfo | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newName: string) => Promise<boolean>;
}

export function BranchRenameDialog({
  branch,
  onOpenChange,
  onConfirm,
}: BranchRenameDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (branch) {
      setName(branch.name);
      setIsSubmitting(false);
    }
  }, [branch]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next = name.trim();
    if (!next || next === branch?.name || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    const success = await onConfirm(next);
    setIsSubmitting(false);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={Boolean(branch)}
      onOpenChange={(open) => {
        if (!isSubmitting) onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <Pencil className="size-4" />
          </div>
          <DialogTitle>重命名分支</DialogTitle>
          <DialogDescription>
            只执行本地分支重命名，不会 push，也不会修改已有 upstream。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <DialogBody className="space-y-3">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2 font-mono text-[10px] text-muted-foreground/60">
              {branch?.name}
            </div>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="新的分支名"
              spellCheck={false}
              disabled={isSubmitting}
              autoFocus
            />
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
              type="submit"
              disabled={isSubmitting || !name.trim() || name.trim() === branch?.name}
            >
              {isSubmitting ? <Check className="animate-pulse" /> : <Check />}
              {isSubmitting ? "正在重命名…" : "确认重命名"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
