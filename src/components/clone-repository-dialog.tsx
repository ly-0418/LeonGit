import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  CloudDownload,
  FolderOpen,
  Loader2,
  LockKeyhole,
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
import { cloneRepository, toGitError } from "@/lib/git-api";
import type { GitError, RepositorySnapshot } from "@/types/git";

interface CloneRepositoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloned: (snapshot: RepositorySnapshot) => void;
}

export function CloneRepositoryDialog({
  open,
  onOpenChange,
  onCloned,
}: CloneRepositoryDialogProps) {
  const [url, setUrl] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [isChoosing, setIsChoosing] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  const chooseTarget = async () => {
    if (isChoosing || isCloning) {
      return;
    }
    setIsChoosing(true);
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择克隆目标文件夹",
      });
      if (typeof selected === "string") {
        setTargetPath(selected);
      }
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsChoosing(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isCloning) {
      return;
    }

    setError(null);
    setIsCloning(true);
    try {
      const snapshot = await cloneRepository(url, targetPath);
      onCloned(snapshot);
      onOpenChange(false);
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsCloning(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isCloning) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isCloning}>
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-azure/15 bg-azure/[0.055] text-azure/75">
            <CloudDownload className="size-4" />
          </div>
          <DialogTitle>克隆远程仓库</DialogTitle>
          <DialogDescription>
            使用系统 Git 克隆。认证交给 Git 凭据管理器，LeonGit
            不读取、不保存密码或 token。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
            <label
              htmlFor="clone-url"
              className="text-[10px] font-medium text-foreground/65"
            >
              远程仓库 URL
            </label>
            <Input
              id="clone-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/owner/repository.git"
              autoFocus
              spellCheck={false}
              disabled={isCloning}
            />
            <p className="text-[9px] text-muted-foreground/35">
              支持 HTTPS / SSH 等系统 Git 支持的 URL；不能包含内嵌凭据。
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="clone-target"
              className="text-[10px] font-medium text-foreground/65"
            >
              目标路径
            </label>
            <div className="flex gap-2">
              <Input
                id="clone-target"
                value={targetPath}
                onChange={(event) => setTargetPath(event.target.value)}
                placeholder="C:\\Projects\\repository"
                spellCheck={false}
                disabled={isCloning}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 shrink-0"
                onClick={() => void chooseTarget()}
                disabled={isCloning || isChoosing}
              >
                {isChoosing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FolderOpen className="size-3.5" />
                )}
                选择
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground/35">
              可选择空文件夹，或输入一个尚不存在的完整路径。
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-[var(--line-subtle)] bg-[var(--surface-subtle)] px-3 py-2.5">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-jade/55" />
            <p className="text-[9px] leading-relaxed text-muted-foreground/40">
              凭据只会交给系统 Git。应用不提供账号登录，也不会把凭据写入仓库或本地存储。
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.055] px-3 py-2.5 text-[10px] leading-relaxed text-rose/80">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {error.message}
            </div>
          )}

          {isCloning && (
            <div className="flex items-center gap-2 rounded-lg border border-azure/12 bg-azure/[0.04] px-3 py-2.5 text-[9.5px] text-azure/65">
              <Loader2 className="size-3.5 animate-spin" />
              正在由系统 Git 克隆，耗时取决于网络和仓库大小…
            </div>
          )}

          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isCloning}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={isCloning || !url.trim() || !targetPath.trim()}
            >
              {isCloning ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CloudDownload />
              )}
              {isCloning ? "正在克隆…" : "开始克隆"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
