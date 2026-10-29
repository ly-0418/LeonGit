import {
  Check,
  Cloud,
  Loader2,
  Pencil,
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
import { addRemote, setRemoteUrl, toGitError } from "@/lib/git-api";
import type { GitError, RemoteInfo } from "@/types/git";

interface RemoteDialogProps {
  open: boolean;
  repoPath: string;
  remotes: RemoteInfo[];
  isLoading: boolean;
  refsError: GitError | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (remotes: RemoteInfo[]) => void;
}

export function RemoteDialog({
  open,
  repoPath,
  remotes,
  isLoading,
  refsError,
  onOpenChange,
  onSaved,
}: RemoteDialogProps) {
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const origin = remotes.find((remote) => remote.name === "origin");
    setName(origin?.name ?? "origin");
    setUrl(origin?.url ?? "");
    setError(null);
  }, [open, remotes]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      const exists = remotes.some((remote) => remote.name === trimmedName);
      const next = exists
        ? await setRemoteUrl(repoPath, trimmedName, url)
        : await addRemote(repoPath, trimmedName, url);
      onSaved(next);
      onOpenChange(false);
    } catch (rawError) {
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
      <DialogContent showCloseButton={!isSaving} className="max-w-[600px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-azure/15 bg-azure/[0.055] text-azure/75">
            <Cloud className="size-4" />
          </div>
          <DialogTitle>远程地址</DialogTitle>
          <DialogDescription>
            添加新远程或修改已有远程 URL。认证仍由系统 Git 凭据管理器处理；URL 不能内嵌凭据。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <DialogBody className="space-y-3">
            <div className="space-y-2">
          {isLoading && remotes.length === 0 ? (
            <div className="flex h-20 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] text-[9.5px] text-muted-foreground/40">
              <Loader2 className="size-3.5 animate-spin" />
              正在读取远程地址…
            </div>
          ) : refsError && remotes.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose/12 bg-rose/[0.035] px-3 py-2.5 text-[9px] leading-relaxed text-rose/60">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              远程列表读取失败：{refsError.message}
            </div>
          ) : remotes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--line)] px-3 py-3 text-[9.5px] text-muted-foreground/35">
              当前仓库还没有远程地址。
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--line)]">
              {remotes.map((remote) => (
                <div
                  key={remote.name}
                  className="flex items-center gap-2 border-t border-[var(--line-subtle)] px-3 py-2 first:border-t-0"
                >
                  <span className="w-16 shrink-0 truncate font-mono text-[10px] text-brand/70">
                    {remote.name}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted-foreground/50"
                    title={remote.url}
                  >
                    {remote.url}
                  </span>
                  <button
                    type="button"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/30 hover:bg-[var(--surface-hover)] hover:text-foreground/70"
                    onClick={() => {
                      setName(remote.name);
                      setUrl(remote.url);
                      setError(null);
                    }}
                    aria-label={`编辑远程 ${remote.name}`}
                  >
                    <Pencil className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <label
                htmlFor="remote-name"
                className="text-[10px] font-medium text-foreground/65"
              >
                远程名
              </label>
              <Input
                id="remote-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="origin"
                spellCheck={false}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="remote-url"
                className="text-[10px] font-medium text-foreground/65"
              >
                URL
              </label>
              <Input
                id="remote-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/owner/repository.git"
                spellCheck={false}
                disabled={isSaving}
              />
            </div>
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
              disabled={isSaving}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim() || !url.trim()}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
              {isSaving ? "正在保存…" : "保存远程地址"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
