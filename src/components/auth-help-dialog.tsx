import { KeyRound, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
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
import { getRemoteAuthInfo, toGitError } from "@/lib/git-api";
import type { GitError, RemoteAuthInfo } from "@/types/git";

interface AuthHelpDialogProps {
  open: boolean;
  repoPath: string | null;
  onOpenChange: (open: boolean) => void;
}

export function AuthHelpDialog({
  open,
  repoPath,
  onOpenChange,
}: AuthHelpDialogProps) {
  const [info, setInfo] = useState<RemoteAuthInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  useEffect(() => {
    if (!open || !repoPath) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setInfo(null);
    void getRemoteAuthInfo(repoPath)
      .then((next) => {
        if (!cancelled) {
          setInfo(next);
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

  const isHttps = info?.urlKind === "https" || info?.urlKind === "http";
  const isSsh = info?.urlKind === "ssh";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px]" showCloseButton>
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-amber-500/20 bg-amber-500/[0.06] text-amber-600">
            <KeyRound className="size-4" />
          </div>
          <DialogTitle>远程凭据排查</DialogTitle>
          <DialogDescription>
            客户端不保存密码或 token；认证由系统 Git / SSH 凭据管理器处理。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[10px] text-muted-foreground/50">
              <Loader2 className="size-3.5 animate-spin" />
              正在读取 Git 凭据配置…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose/15 bg-rose/[0.05] px-3 py-2.5 text-[10px] text-rose/75">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {error.message}
            </div>
          )}

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40">
              credential.helper
            </div>
            <div className="mt-1 break-all font-mono text-[10px] text-foreground/75">
              {info?.credentialHelper ?? "未配置"}
            </div>
            {!isLoading && info && !info.credentialHelper && (
              <p className="mt-1 text-[9px] leading-relaxed text-rose/60">
                HTTP(S) 认证需要 credential.helper；未配置时 Git 无法读取系统凭据。
              </p>
            )}
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40">
                remote URL
              </span>
              {info && (
                <span className="rounded border border-[var(--line)] px-1.5 py-px text-[8px] text-muted-foreground/45">
                  {info.urlKind === "https"
                    ? "HTTPS"
                    : info.urlKind === "http"
                      ? "HTTP"
                      : info.urlKind === "ssh"
                        ? "SSH"
                        : "其他"}
                </span>
              )}
            </div>
            <div className="mt-1 break-all font-mono text-[10px] text-foreground/75">
              {info?.remoteUrl ?? "当前仓库没有 origin 远程地址"}
            </div>
            {info?.remoteUrlRedacted && (
              <p className="mt-1 text-[8.5px] text-muted-foreground/40">
                URL 中的凭据信息已隐藏。
              </p>
            )}
          </div>

          {isHttps && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[9.5px] leading-relaxed text-muted-foreground/60">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-jade/60" />
              <span>
                HTTP(S)：检查 Windows 凭据管理器中的凭据是否过期或已撤销；可删除旧凭据后重新
                Push，让 Git 通过 credential.helper 重新获取。客户端不会弹出密码输入框。
              </span>
            </div>
          )}

          {isSsh && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[9.5px] leading-relaxed text-muted-foreground/60">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-jade/60" />
              <span>
                SSH：运行 <code>ssh-add -l</code> 检查 key 是否已加载到 agent；检查{" "}
                <code>~/.ssh/config</code> 中的 Host/IdentityFile，以及 key 文件权限。
                可用 <code>ssh -T git@github.com</code> 验证。
              </span>
            </div>
          )}

          {!isHttps && !isSsh && !isLoading && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[9.5px] leading-relaxed text-muted-foreground/60">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-jade/60" />
              <span>
                请检查 remote URL 的协议与 Git 凭据配置；客户端不提供在应用内输入密码的入口。
              </span>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
