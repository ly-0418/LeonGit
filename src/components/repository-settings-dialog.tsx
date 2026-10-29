import {
  Check,
  Loader2,
  RotateCw,
  Settings2,
  ShieldCheck,
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
import {
  getRepositoryConfig,
  saveRepositoryIdentity,
  toGitError,
} from "@/lib/git-api";
import type {
  ConfigSource,
  GitError,
  RepositoryConfig,
} from "@/types/git";

interface RepositorySettingsDialogProps {
  open: boolean;
  repoPath: string;
  repoName: string;
  onOpenChange: (open: boolean) => void;
}

function SourceBadge({ source }: { source?: ConfigSource }) {
  if (!source) {
    return (
      <span className="rounded border border-[var(--line)] px-1.5 py-px text-[8px] text-muted-foreground/25">
        未设置
      </span>
    );
  }
  return (
    <span
      className={
        source === "local"
          ? "rounded border border-jade/15 bg-jade/[0.045] px-1.5 py-px text-[8px] text-jade/60"
          : "rounded border border-[var(--line)] bg-[var(--surface-subtle)] px-1.5 py-px text-[8px] text-muted-foreground/35"
      }
    >
      {source === "local" ? "仓库本地" : "继承全局"}
    </span>
  );
}

export function RepositorySettingsDialog({
  open,
  repoPath,
  repoName,
  onOpenChange,
}: RepositorySettingsDialogProps) {
  const [config, setConfig] = useState<RepositoryConfig | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadToken, setLoadToken] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSaved(false);
    setConfig(null);

    void getRepositoryConfig(repoPath)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setConfig(next);
        setName(next.userName?.value ?? "");
        setEmail(next.userEmail?.value ?? "");
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
  }, [loadToken, open, repoPath]);

  const currentName = config?.userName?.value ?? "";
  const currentEmail = config?.userEmail?.value ?? "";
  const dirty = name !== currentName || email !== currentEmail;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSaving || !dirty) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await saveRepositoryIdentity(repoPath, name, email);
      setConfig(next);
      setName(next.userName?.value ?? "");
      setEmail(next.userEmail?.value ?? "");
      setSaved(true);
    } catch (rawError) {
      setError(toGitError(rawError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSaving) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isSaving}>
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-brand/15 bg-brand/[0.05] text-brand/70">
            <Settings2 className="size-4" />
          </div>
          <DialogTitle>仓库配置</DialogTitle>
          <DialogDescription>
            {repoName} · user.name / user.email 写入当前仓库的本地配置，不修改全局
            Git 配置。
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-48 flex-col items-center justify-center text-[10px] text-muted-foreground/45">
            <Loader2 className="mb-2 size-4 animate-spin text-brand/55" />
            正在读取仓库配置…
          </div>
        ) : error && !config ? (
          <div className="flex h-48 flex-col items-center justify-center px-6 text-center">
            <TriangleAlert className="size-5 text-rose/70" />
            <p className="mt-3 text-[11px] font-medium text-foreground/70">
              无法读取仓库配置
            </p>
            <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground/45">
              {error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => setLoadToken((token) => token + 1)}
            >
              <RotateCw className="size-3.5" />
              重试
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <DialogBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="repo-user-name"
                    className="text-[10px] font-medium text-foreground/65"
                  >
                    user.name
                  </label>
                  <SourceBadge source={config?.userName?.source} />
                </div>
                <Input
                  id="repo-user-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setSaved(false);
                  }}
                  placeholder="例如：Leon Chen"
                  disabled={isSaving}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="repo-user-email"
                    className="text-[10px] font-medium text-foreground/65"
                  >
                    user.email
                  </label>
                  <SourceBadge source={config?.userEmail?.source} />
                </div>
                <Input
                  id="repo-user-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setSaved(false);
                  }}
                  placeholder="例如：leon@example.com"
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-foreground/65">
                  origin URL
                </span>
                <span className="rounded border border-[var(--line)] px-1.5 py-px text-[8px] text-muted-foreground/25">
                  只读
                </span>
              </div>
              <div className="min-h-9 break-all rounded-lg border border-[var(--line)] bg-[var(--well)] px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground/55">
                {config?.originUrl ?? "当前仓库没有 origin 远程地址"}
              </div>
              {config?.originUrlRedacted && (
                <p className="flex items-center gap-1.5 text-[8.5px] text-rose/55">
                  <ShieldCheck className="size-3" />
                  URL 中检测到内嵌凭据，展示时已隐藏；应用不会存储它。
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-[var(--line-subtle)] bg-[var(--surface-subtle)] px-3 py-2.5">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-jade/50" />
              <p className="text-[9px] leading-relaxed text-muted-foreground/38">
                只写入当前仓库的 .git/config。客户端不保存密码或 token；远程操作仍交给系统
                Git 凭据管理器。
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.055] px-3 py-2.5 text-[10px] leading-relaxed text-rose/80">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {error.message}
              </div>
            )}

            {saved && (
              <div className="flex items-center gap-2 rounded-lg border border-jade/15 bg-jade/[0.045] px-3 py-2 text-[9.5px] text-jade/70">
                <Check className="size-3.5" />
                已保存到当前仓库配置
              </div>
            )}

            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
              >
                关闭
              </Button>
              <Button type="submit" disabled={isSaving || !dirty}>
                {isSaving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Check />
                )}
                {isSaving ? "正在保存…" : "保存到仓库配置"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
