import { FileX2, FolderX, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import {
  addToGitignore,
  checkIgnored,
  listGitignoreFiles,
  toGitError,
} from "@/lib/git-api";
import { fileName, parentPath } from "@/lib/format";
import type { GitError, StatusFile } from "@/types/git";

interface GitignoreDialogProps {
  open: boolean;
  repoPath: string | null;
  file: StatusFile | null;
  tracked: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: (message: string) => void;
}

function targetDirectory(target: string): string {
  return parentPath(target);
}

export function GitignoreDialog({
  open,
  repoPath,
  file,
  tracked,
  onOpenChange,
  onApplied,
}: GitignoreDialogProps) {
  const [targets, setTargets] = useState<string[]>([".gitignore"]);
  const [target, setTarget] = useState(".gitignore");
  const [mode, setMode] = useState<"file" | "directory">("file");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  useEffect(() => {
    if (!open || !file || !repoPath) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setMode(file.path.endsWith("/") ? "directory" : "file");
    setTarget(".gitignore");
    void listGitignoreFiles(repoPath)
      .then((next) => {
        if (!cancelled) {
          setTargets(next.length > 0 ? next : [".gitignore"]);
        }
      })
      .catch((rawError: unknown) => {
        if (!cancelled) {
          setError(toGitError(rawError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file, open, repoPath]);

  const trimmedPath = file ? file.path.replace(/[\\/]+$/, "") : "";
  const directoryEntry = Boolean(file?.path.endsWith("/"));
  const fileDir = parentPath(trimmedPath);
  const availableTargets = useMemo(() => {
    if (!file) {
      return [".gitignore"];
    }
    return targets.filter((candidate) => {
      if (candidate === ".gitignore") {
        return true;
      }
      const directory = targetDirectory(candidate);
      return (
        fileDir === directory ||
        (directory.length > 0 && fileDir.startsWith(`${directory}/`))
      );
    });
  }, [file, fileDir, targets]);

  const selectedTarget = availableTargets.includes(target)
    ? target
    : (availableTargets[0] ?? ".gitignore");
  const selectedDir = targetDirectory(selectedTarget);
  const relativePath =
    selectedDir.length === 0
      ? trimmedPath
      : trimmedPath.slice(selectedDir.length + 1);
  const relativeParent = parentPath(relativePath);
  const directoryPattern = directoryEntry
    ? relativePath
      ? `${relativePath}/`
      : ""
    : relativeParent
      ? `${relativeParent}/`
      : "";
  const directoryAvailable = directoryPattern.length > 0;

  useEffect(() => {
    if (mode === "directory" && !directoryAvailable) {
      setMode("file");
    }
  }, [directoryAvailable, mode]);

  const pattern = file
    ? mode === "directory"
      ? directoryPattern
      : fileName(trimmedPath)
    : "";

  if (!open) {
    return null;
  }

  const submit = async () => {
    if (!repoPath || !file || tracked || isSaving || !pattern) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await addToGitignore(repoPath, pattern, selectedTarget);
      const ignored = await checkIgnored(repoPath, file.path);
      onApplied(
        ignored
          ? `${file.path} 已加入 ${selectedTarget}，工作区将刷新。`
          : `已写入 ${selectedTarget}，但 Git 暂未报告该路径被忽略；请检查规则或被跟踪状态。`,
      );
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
      <DialogContent showCloseButton={!isSaving} className="max-w-[540px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-azure/15 bg-azure/[0.05] text-azure/75">
            <FileX2 className="size-4" />
          </div>
          <DialogTitle>加入 .gitignore</DialogTitle>
          <DialogDescription>
            {file?.path ?? ""}
            {tracked
              ? " 已被 Git 跟踪，忽略规则不会自动生效。"
              : " 当前未被跟踪，可追加忽略规则。"}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {tracked ? (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.055] px-3 py-2.5 text-[10px] leading-relaxed text-amber-700/85 dark:text-amber-300/80">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  已跟踪文件需要先执行 <code>git rm --cached</code> 才能被
                  .gitignore 生效。客户端不会自动执行该命令，也不会删除文件或取消跟踪。
                </span>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5">
                <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40">
                  需要手动执行
                </div>
                <code className="mt-1 block break-all font-mono text-[10px] text-foreground/80">
                  git rm --cached -- "{file?.path ?? ""}"
                </code>
                <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground/45">
                  执行后文件会变为未跟踪；再重新打开此入口即可加入 .gitignore。
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="text-[10px] font-medium text-foreground/65">
                  忽略方式
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("file")}
                    disabled={directoryEntry}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      mode === "file"
                        ? "border-brand/40 bg-brand/[0.06]"
                        : "border-[var(--line)] bg-[var(--surface-subtle)] hover:border-[var(--line-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground/75">
                      <FileX2 className="size-3.5" />
                      按文件名忽略
                    </div>
                    <div className="mt-1 break-all font-mono text-[9px] text-muted-foreground/45">
                      {file ? fileName(trimmedPath) : ""}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("directory")}
                    disabled={!directoryAvailable}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      mode === "directory"
                        ? "border-brand/40 bg-brand/[0.06]"
                        : "border-[var(--line)] bg-[var(--surface-subtle)] hover:border-[var(--line-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground/75">
                      <FolderX className="size-3.5" />
                      按目录忽略
                    </div>
                    <div className="mt-1 break-all font-mono text-[9px] text-muted-foreground/45">
                      {directoryAvailable
                        ? directoryPattern
                        : "文件位于当前 .gitignore 目录"}
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="gitignore-target"
                  className="text-[10px] font-medium text-foreground/65"
                >
                  目标 .gitignore
                </label>
                <select
                  id="gitignore-target"
                  value={selectedTarget}
                  onChange={(event) => setTarget(event.target.value)}
                  disabled={isLoading || isSaving}
                  className="h-8 w-full rounded-md border border-[var(--line)] bg-[var(--surface-subtle)] px-2 font-mono text-[10px] text-foreground/75 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {availableTargets.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
                {isLoading && (
                  <p className="flex items-center gap-1.5 text-[8.5px] text-muted-foreground/40">
                    <Loader2 className="size-3 animate-spin" />
                    正在查找 .gitignore…
                  </p>
                )}
                {!isLoading && availableTargets.length === 1 && (
                  <p className="text-[8.5px] text-muted-foreground/40">
                    当前文件只有根 .gitignore 可选；嵌套目标仅在文件位于其目录下时可选。
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5">
                <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40">
                  将追加
                </div>
                <code className="mt-1 block break-all font-mono text-[11px] text-foreground/80">
                  {pattern}
                </code>
                <div className="mt-1 text-[8.5px] text-muted-foreground/40">
                  → {selectedTarget}
                </div>
              </div>
            </>
          )}

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
            {tracked ? "关闭" : "取消"}
          </Button>
          {!tracked && (
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={isSaving || isLoading || !pattern}
            >
              {isSaving ? <Loader2 className="animate-spin" /> : <FileX2 />}
              {isSaving ? "正在写入…" : "加入 .gitignore"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
