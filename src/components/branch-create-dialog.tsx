import {
  GitBranch,
  Loader2,
  TriangleAlert,
} from "lucide-react";
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
import { createBranch, toGitError } from "@/lib/git-api";
import type { BranchInfo, GitError } from "@/types/git";

interface BranchCreateDialogProps {
  open: boolean;
  repoPath: string;
  defaultStartPoint: string | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (branches: BranchInfo[]) => void;
}

export function BranchCreateDialog({
  open,
  repoPath,
  defaultStartPoint,
  onOpenChange,
  onCreated,
}: BranchCreateDialogProps) {
  const [name, setName] = useState("");
  const [startPoint, setStartPoint] = useState(defaultStartPoint ?? "");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName("");
    setStartPoint(defaultStartPoint ?? "");
    setError(null);
  }, [defaultStartPoint, open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isCreating) {
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const branches = await createBranch(
        repoPath,
        name,
        startPoint.trim() || null,
      );
      onCreated(branches);
      onOpenChange(false);
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isCreating) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!isCreating} className="max-w-[460px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-jade/15 bg-jade/[0.05] text-jade/75">
            <GitBranch className="size-4" />
          </div>
          <DialogTitle>创建本地分支</DialogTitle>
          <DialogDescription>
            从当前 HEAD 或指定提交创建分支。创建后不会自动切换，也不会改动工作区。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
            <label
              htmlFor="new-branch-name"
              className="text-[10px] font-medium text-foreground/65"
            >
              分支名
            </label>
            <Input
              id="new-branch-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="feature/branch-name"
              autoFocus
              spellCheck={false}
              disabled={isCreating}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="new-branch-start"
              className="text-[10px] font-medium text-foreground/65"
            >
              起始提交
            </label>
            <Input
              id="new-branch-start"
              value={startPoint}
              onChange={(event) => setStartPoint(event.target.value)}
              placeholder="留空 = 当前 HEAD；或粘贴完整 commit SHA"
              spellCheck={false}
              disabled={isCreating}
            />
            <p className="text-[8.5px] leading-relaxed text-muted-foreground/35">
              {defaultStartPoint
                ? "已预填当前查看的提交；清空则从 HEAD 创建。"
                : "也可以从提交详情选中一个提交后再次打开本对话框。"}
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.055] px-3 py-2.5 text-[10px] leading-relaxed text-rose/80">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {error.message}
            </div>
          )}

          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              取消
            </Button>
            <Button type="submit" disabled={isCreating || !name.trim()}>
              {isCreating ? (
                <Loader2 className="animate-spin" />
              ) : (
                <GitBranch />
              )}
              {isCreating ? "正在创建…" : "创建分支"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
