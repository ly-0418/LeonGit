import { GitBranch, Loader2, TriangleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { createBranchFromDetached, toGitError } from "@/lib/git-api";
import type { GitError } from "@/types/git";

interface DetachedBranchDialogProps {
  open: boolean;
  repoPath: string | null;
  suggestedName: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (branchName: string) => void;
}

export function DetachedBranchDialog({
  open,
  repoPath,
  suggestedName,
  onOpenChange,
  onCreated,
}: DetachedBranchDialogProps) {
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(suggestedName);
    setIsSaving(false);
    setError(null);
  }, [open, suggestedName]);

  const canSave = Boolean(repoPath) && name.trim().length > 0 && !isSaving;

  const submit = async () => {
    if (!canSave || !repoPath) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const branchName = name.trim();
      await createBranchFromDetached(repoPath, branchName);
      onCreated(branchName);
      onOpenChange(false);
    } catch (rawError: unknown) {
      setError(toGitError(rawError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSaving) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!isSaving} className="max-w-[500px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <GitBranch className="size-4" />
          </div>
          <DialogTitle>创建分支保存提交</DialogTitle>
          <DialogDescription>
            从当前 detached HEAD 创建并切换到一个新分支，等价于
            `git switch -c &lt;new-branch&gt;`。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.055] px-3 py-2.5 text-[9.5px] leading-relaxed text-amber-700/85 dark:text-amber-300/80">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            创建分支不会自动提交或 push；当前 HEAD 及其提交会由新分支保存，工作区不变。
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="detached-branch-name"
              className="text-[10px] font-medium text-foreground/65"
            >
              新分支名
            </label>
            <Input
              id="detached-branch-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如 detached-work"
              maxLength={120}
              disabled={isSaving}
              autoFocus
            />
            <p className="text-[8.5px] text-muted-foreground/40">
              名称已存在或不符合 Git 命名规则时会返回错误。
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose/15 bg-rose/[0.05] px-3 py-2 text-[9.5px] leading-relaxed text-rose/75"
            >
              {error.message}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            取消
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSave}>
            {isSaving ? <Loader2 className="animate-spin" /> : <GitBranch />}
            {isSaving ? "正在创建…" : "创建并切换"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
