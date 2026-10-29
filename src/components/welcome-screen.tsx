import {
  ChevronRight,
  CloudDownload,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  GitCompareArrows,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { formatRecentTime } from "@/lib/format";
import { MAX_REPOS, type RepoEntry } from "@/types/ui";

interface WelcomeScreenProps {
  repos: RepoEntry[];
  isBusy: boolean;
  onOpen: () => void;
  onClone: () => void;
  onInit: () => void;
  onSelectRepo: (path: string) => void;
  onRemoveRepo: (path: string) => void;
}

export function WelcomeScreen({
  repos,
  isBusy,
  onOpen,
  onClone,
  onInit,
  onSelectRepo,
  onRemoveRepo,
}: WelcomeScreenProps) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto overflow-x-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="app-grid absolute inset-0 opacity-55" />
        <div className="absolute -right-40 -top-56 size-[620px] rounded-full border border-[var(--line-subtle)]" />
        <div className="absolute -right-20 -top-36 size-[420px] rounded-full border border-[var(--line-subtle)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_72%_22%,rgba(232,182,102,0.06),transparent_68%)]" />
        <div className="absolute bottom-0 left-0 h-64 w-[420px] bg-[radial-gradient(ellipse_at_bottom_left,rgba(98,214,163,0.035),transparent_70%)]" />
      </div>

      <header className="relative z-10 flex shrink-0 items-center justify-between px-7 py-5">
        <div className="flex items-center gap-3">
          <BrandMark className="size-8 rounded-[9px]" />
          <div>
            <div className="text-[14px] font-semibold leading-none tracking-[-0.02em]">
              LeonGit
            </div>
            <div className="mt-1.5 text-[7.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground/40">
              local git workspace
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-jade/10 bg-jade/[0.035] px-2.5 py-1 text-[8.5px] text-jade/60">
          <ShieldCheck className="size-3" />
          本地优先 · 无遥测
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-7 pb-16 pt-6">
        <div className="rise-in w-full max-w-[780px]">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="absolute inset-0 scale-150 rounded-full bg-brand/10 blur-2xl" />
              <BrandMark className="relative size-16 rounded-[20px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)]" />
            </div>

            <div className="mt-7 flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-1 text-[8.5px] uppercase tracking-[0.2em] text-brand/55">
              <span className="size-1 rounded-full bg-brand/60" />
              Stage 5 · UI 架构
            </div>

            <h1 className="mt-4 text-balance text-[40px] font-semibold leading-[1.12] tracking-[-0.05em] text-foreground/95">
              打开仓库，
              <span className="text-brand-gradient">看清每一处改动。</span>
            </h1>
            <p className="mt-4 max-w-[500px] text-[12px] leading-[1.9] text-muted-foreground/55">
              查看四类工作区状态、提交历史与分支，完成整文件暂存、提交、
              分支切换和 fetch/pull/push。无需登录，所有数据留在本机。
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
              <Button size="lg" className="min-w-[152px]" onClick={onOpen} disabled={isBusy}>
                {isBusy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FolderOpen />
                )}
                {isBusy ? "正在打开…" : "打开本地仓库"}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="min-w-[152px]"
                onClick={onClone}
                disabled={isBusy}
              >
                <CloudDownload className="text-azure/75" />
                克隆远程仓库
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="min-w-[132px]"
                onClick={onInit}
                disabled={isBusy}
              >
                <FolderPlus className="text-brand/70" />
                初始化仓库
              </Button>
            </div>

            <div className="mt-3 text-[9px] text-muted-foreground/35">
              点击按钮打开仓库，或把仓库文件夹拖进窗口。
            </div>
          </div>

          <div className="mt-10 grid gap-2 sm:grid-cols-3">
            <Feature
              icon={GitCompareArrows}
              title="三向 diff"
              description="工作区 / 暂存区 / HEAD"
            />
            <Feature
              icon={FolderGit2}
              title="四类状态"
              description="已暂存 · 未暂存 · 未跟踪 · 冲突"
            />
            <Feature
              icon={ShieldCheck}
              title="系统 Git"
              description="不存储密码或 token"
            />
          </div>

          <section className="mt-9">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/40">
                <FolderGit2 className="size-3" />
                仓库列表
              </div>
              <span className="font-mono text-[8.5px] text-muted-foreground/25">
                {repos.length}/{MAX_REPOS}
              </span>
            </div>

            {repos.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-subtle)] px-4 py-4">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-muted-foreground/25">
                  <FolderGit2 className="size-3.5" />
                </div>
                <div>
                  <div className="text-[10.5px] text-muted-foreground/55">
                    还没有打开过仓库
                  </div>
                  <div className="mt-0.5 text-[9px] text-muted-foreground/30">
                    打开或克隆仓库后，这里会保留最近 {MAX_REPOS} 个路径。
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {repos.map((repo) => (
                  <div
                    key={repo.id || repo.path}
                    className="group flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left outline-none disabled:opacity-50"
                      onClick={() => onSelectRepo(repo.path)}
                      disabled={isBusy}
                      title={repo.path}
                    >
                      <div className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] text-brand/55">
                        <FolderGit2 className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10.5px] font-medium text-foreground/70">
                          {repo.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[8.5px] text-muted-foreground/28">
                          <span className="truncate font-mono">
                            {repo.path}
                          </span>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">
                            {formatRecentTime(repo.openedAt)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/15 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground/35" />
                    </button>
                    <button
                      type="button"
                      className="mr-1.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/20 opacity-0 outline-none transition-opacity hover:bg-[var(--surface-hover)] hover:text-muted-foreground/50 focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={() => onRemoveRepo(repo.path)}
                      aria-label={`从仓库列表移除 ${repo.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="relative z-10 flex shrink-0 items-center justify-between border-t border-[var(--line-subtle)] px-7 py-3.5 text-[8.5px] text-muted-foreground/25">
        <span>LeonGit · 本地 Git 工作台</span>
        <span>暂存、提交、分支与远程同步 · 认证交给系统 Git</span>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof GitCompareArrows;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-subtle)] px-3.5 py-3">
      <div className="grid size-7 shrink-0 place-items-center rounded-lg border border-brand/10 bg-brand/[0.035] text-brand/55">
        <Icon className="size-3.5" />
      </div>
      <div>
        <div className="text-[9.5px] font-medium text-foreground/60">
          {title}
        </div>
        <div className="mt-0.5 text-[8.5px] text-muted-foreground/28">
          {description}
        </div>
      </div>
    </div>
  );
}
