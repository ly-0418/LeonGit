import { TriangleAlert, X } from "lucide-react";

import type { GitError, GitErrorKind } from "@/types/git";

const ERROR_TITLES: Record<GitErrorKind, string> = {
  gitNotFound: "找不到 Git",
  notRepository: "不是 Git 仓库",
  invalidPath: "路径不可用",
  invalidInput: "输入无效",
  identityMissing: "提交者身份未配置",
  worktreeDirty: "有未提交修改",
  commandFailed: "Git 操作失败",
  timeout: "连接超时",
  invalidOutput: "无法解析 Git 数据",
  io: "本地操作失败",
};

interface ErrorBannerProps {
  error: GitError;
  onDismiss: () => void;
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="rise-in w-full overflow-hidden rounded-xl border border-rose/[0.18] bg-[var(--surface-danger)] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl"
    >
      <div className="h-px w-full bg-gradient-to-r from-transparent via-rose/45 to-transparent" />
      <div className="flex gap-3 p-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-rose/15 bg-rose/[0.07] text-rose/80">
          <TriangleAlert className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-foreground/85">
            {ERROR_TITLES[error.kind]}
          </div>
          <p className="mt-1 break-words text-[10.5px] leading-relaxed text-muted-foreground/72">
            {error.message}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/40 outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="关闭错误提示"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
