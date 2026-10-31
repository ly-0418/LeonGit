import { GitBranch, Link2, Loader2, TriangleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { listRemoteBranches, setUpstream, toGitError } from "@/lib/git-api";
import type {
  BranchInfo,
  GitError,
  RemoteBranchInfo,
  RemoteInfo,
} from "@/types/git";

interface SetUpstreamDialogProps {
  open: boolean;
  repoPath: string | null;
  branch: BranchInfo | null;
  remotes: RemoteInfo[];
  onOpenChange: (open: boolean) => void;
  onSaved: (branch: BranchInfo, remote: string, remoteBranch: string) => void;
}

function splitUpstream(upstream: string | null): {
  remote: string;
  branch: string;
} | null {
  if (!upstream) {
    return null;
  }
  const slash = upstream.indexOf("/");
  if (slash <= 0 || slash === upstream.length - 1) {
    return null;
  }
  return {
    remote: upstream.slice(0, slash),
    branch: upstream.slice(slash + 1),
  };
}

export function SetUpstreamDialog({
  open,
  repoPath,
  branch,
  remotes,
  onOpenChange,
  onSaved,
}: SetUpstreamDialogProps) {
  const [remote, setRemote] = useState("");
  const [remoteBranch, setRemoteBranch] = useState("");
  const [remoteBranches, setRemoteBranches] = useState<RemoteBranchInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  useEffect(() => {
    if (!open || !branch) {
      return;
    }
    const current = splitUpstream(branch.upstream);
    const defaultRemote =
      current && remotes.some((item) => item.name === current.remote)
        ? current.remote
        : (remotes[0]?.name ?? "");
    setRemote(defaultRemote);
    setRemoteBranch(
      current && current.remote === defaultRemote
        ? current.branch
        : branch.name,
    );
    setError(null);
  }, [branch, open, remotes]);

  useEffect(() => {
    if (!open || !repoPath) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void listRemoteBranches(repoPath)
      .then((next) => {
        if (!cancelled) {
          setRemoteBranches(next);
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
  }, [open, repoPath]);

  const options = useMemo(
    () =>
      remoteBranches
        .filter((item) => item.remote === remote)
        .map((item) => item.name)
        .sort(),
    [remote, remoteBranches],
  );
  const currentUpstream = branch?.upstream ?? null;
  const canSave =
    Boolean(repoPath) &&
    Boolean(branch) &&
    Boolean(remote) &&
    remoteBranch.trim().length > 0 &&
    !isSaving;

  const submit = async () => {
    if (!canSave || !repoPath || !branch) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await setUpstream(
        repoPath,
        branch.name,
        remote,
        remoteBranch.trim(),
      );
      onSaved(branch, remote, remoteBranch.trim());
      onOpenChange(false);
    } catch (rawError: unknown) {
      setError(toGitError(rawError));
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || !branch) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSaving) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!isSaving} className="max-w-[520px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/75">
            <Link2 className="size-4" />
          </div>
          <DialogTitle>修改 upstream</DialogTitle>
          <DialogDescription>
            为本地分支 <span className="font-mono">{branch.name}</span> 指定已存在的远程跟踪分支。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40">
              当前 upstream
            </div>
            <div className="mt-1 font-mono text-[10px] text-foreground/75">
              {currentUpstream ?? "未设置"}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="upstream-remote"
              className="text-[10px] font-medium text-foreground/65"
            >
              远程
            </label>
            <select
              id="upstream-remote"
              value={remote}
              onChange={(event) => setRemote(event.target.value)}
              disabled={isSaving || remotes.length === 0}
              className="h-8 w-full rounded-md border border-[var(--line)] bg-[var(--surface-subtle)] px-2 font-mono text-[10px] text-foreground/75 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {remotes.length === 0 && <option value="">没有远程</option>}
              {remotes.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="upstream-branch"
              className="text-[10px] font-medium text-foreground/65"
            >
              远程分支
            </label>
            <Input
              id="upstream-branch"
              value={remoteBranch}
              onChange={(event) => setRemoteBranch(event.target.value)}
              list="upstream-branch-options"
              placeholder="例如 dev 或 feature/login"
              disabled={isSaving}
              autoComplete="off"
            />
            <datalist id="upstream-branch-options">
              {options.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div className="flex items-center gap-1.5 text-[8.5px] text-muted-foreground/40">
              {isLoading ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  正在读取远程分支…
                </>
              ) : (
                <>
                  <GitBranch className="size-3" />
                  可输入或从 {remote || "远程"} 的已有分支中选择；不会创建远程分支。
                </>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[9px] leading-relaxed text-muted-foreground/55">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600/65" />
            只修改本地分支配置，不会 push、不会删除远程分支。目标远程分支不存在时会被拒绝。
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
            {isSaving ? <Loader2 className="animate-spin" /> : <Link2 />}
            {isSaving ? "正在保存…" : "保存 upstream"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
