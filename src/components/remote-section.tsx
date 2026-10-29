import {
  ArrowDownToLine,
  CloudDownload,
  Cloud,
  History,
  Loader2,
  RotateCw,
  Settings2,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GitError, RemoteInfo, SyncAction } from "@/types/git";

interface RemoteSectionProps {
  remotes: RemoteInfo[];
  isLoading: boolean;
  error: GitError | null;
  isSyncing: boolean;
  syncAction: SyncAction | null;
  onManage: () => void;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onReflog: () => void;
  onReload: () => void;
}

export function RemoteSection({
  remotes,
  isLoading,
  error,
  isSyncing,
  syncAction,
  onManage,
  onFetch,
  onPull,
  onPush,
  onReflog,
  onReload,
}: RemoteSectionProps) {
  const origin = remotes.find((remote) => remote.name === "origin");
  const hasRemote = remotes.length > 0;

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.19em] text-muted-foreground/55">
          远程
        </span>
        <span className="font-mono text-[8.5px] text-muted-foreground/25">
          {remotes.length}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto size-6 text-muted-foreground/45"
              onClick={onManage}
              aria-label="管理远程地址"
            >
              <Settings2 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>管理远程地址</TooltipContent>
        </Tooltip>
      </div>

      <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] p-2.5">
        <div className="flex items-center gap-2">
          <Cloud className="size-3 shrink-0 text-azure/55" />
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground/45">
            origin
          </span>
          <span
            className="min-w-0 flex-1 truncate font-mono text-[8px] text-muted-foreground/30"
            title={origin?.url ?? error?.message}
          >
            {isLoading && !origin
              ? "读取中…"
              : error && !origin
                ? "远程列表读取失败"
                : (origin?.url ?? "未设置 origin")}
          </span>
          {error && !origin && (
            <button
              type="button"
              onClick={onReload}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground/35 hover:bg-[var(--surface-hover)] hover:text-foreground/65"
              aria-label="重试读取远程"
            >
              <RotateCw className="size-2.5" />
            </button>
          )}
        </div>

        {error && !origin && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-rose/10 bg-rose/[0.035] px-2 py-1.5 text-[8px] leading-relaxed text-rose/55">
            <TriangleAlert className="mt-0.5 size-2.5 shrink-0" />
            {error.message}
          </div>
        )}

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <SyncButton
            label="Fetch"
            icon={CloudDownload}
            active={isSyncing && syncAction === "fetch"}
            disabled={isSyncing || !hasRemote}
            onClick={onFetch}
            title="只更新远程跟踪分支，不改变工作区"
          />
          <SyncButton
            label="Pull"
            icon={ArrowDownToLine}
            active={isSyncing && syncAction === "pull"}
            disabled={isSyncing || !hasRemote}
            onClick={onPull}
            title="拉取当前分支；冲突时进入冲突状态"
          />
          <SyncButton
            label="Push"
            icon={Upload}
            active={isSyncing && syncAction === "push"}
            disabled={isSyncing || !hasRemote}
            onClick={onPush}
            title="推送当前分支；首次推送设置 upstream"
          />
        </div>

        <button
          type="button"
          onClick={onReflog}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[8.5px] text-muted-foreground/40 outline-none transition-colors hover:bg-[var(--surface-muted)] hover:text-foreground/70"
        >
          <History className="size-3 text-brand/45" />
          查看 Reflog
          <span className="ml-auto font-mono text-[7px] text-muted-foreground/20">
            只读
          </span>
        </button>
      </div>
    </section>
  );
}

function SyncButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
  title,
}: {
  label: string;
  icon: typeof CloudDownload;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "flex h-7 items-center justify-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-subtle)] text-[8px] text-muted-foreground/55 outline-none transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)] hover:text-foreground/80 focus-visible:ring-1 focus-visible:ring-brand/35 disabled:pointer-events-none disabled:opacity-35",
            active && "border-brand/20 bg-brand/[0.06] text-brand/75",
          )}
        >
          {active ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Icon className="size-3" />
          )}
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
