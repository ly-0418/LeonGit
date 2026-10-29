import { FolderPlus, Loader2, FolderOpen } from "lucide-react";
import { useState, type FormEvent } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

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
import { initRepository, toGitError } from "@/lib/git-api";
import type { GitError } from "@/types/git";

interface InitRepositoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInitialized: (path: string) => void;
}

function repositoryName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function InitRepositoryDialog({
  open,
  onOpenChange,
  onInitialized,
}: InitRepositoryDialogProps) {
  const [path, setPath] = useState("");
  const [branch, setBranch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  const chooseDirectory = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择要初始化的目录",
      });
      if (typeof selected === "string") {
        setPath(selected);
        setError(null);
      }
    } catch (rawError) {
      setError(toGitError(rawError));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting || !path) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await initRepository(path, branch.trim() || null);
      onInitialized(path);
      onOpenChange(false);
      setPath("");
      setBranch("");
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) {
          onOpenChange(next);
          if (!next) {
            setError(null);
          }
        }
      }}
    >
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <FolderPlus className="size-4" />
          </div>
          <DialogTitle>初始化仓库</DialogTitle>
          <DialogDescription>
            在已有空目录中执行 git init；初始化后只加入仓库列表，不会自动打开。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-foreground/65">
              目录
            </label>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="选择或输入目录路径"
                spellCheck={false}
                disabled={isSubmitting}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void chooseDirectory()}
                disabled={isSubmitting}
              >
                <FolderOpen />
                选择
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-foreground/65">
              初始分支（可选）
            </label>
            <Input
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="留空使用系统 Git 默认分支"
              spellCheck={false}
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose/15 bg-rose/[0.05] px-3 py-2 text-[10px] leading-relaxed text-rose/75">
              {error.message}
            </div>
          )}

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
            <Button type="submit" disabled={isSubmitting || !path}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <FolderPlus />}
              {isSubmitting ? "正在初始化…" : "初始化"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { repositoryName };
