import { useVirtualizer } from "@tanstack/react-virtual";
import {
  GitBranch,
  GitGraph,
  History,
  List,
  Loader2,
  RotateCw,
  Search,
  Tag,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { DagCanvas } from "@/components/dag-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCommitHistory } from "@/hooks/use-commit-history";
import { useDagLayout } from "@/hooks/use-dag-layout";
import { dagGutterWidth } from "@/lib/dag-layout";
import { formatCount, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommitRef, CommitSummary } from "@/types/git";

const ROW_HEIGHT = 68;
type HistoryView = "list" | "dag";

interface CommitHistoryProps {
  repoPath: string;
  refreshToken: number;
  totalCommits: number;
  selectedOid: string | null;
  onSelectCommit: (commit: CommitSummary) => void;
}

function visibleRefs(commit: CommitSummary): CommitRef[] {
  return commit.refs
    .filter((ref) => ref.kind === "branch" || ref.kind === "tag")
    .slice(0, 2);
}

function CommitRow({
  commit,
  selected,
  active,
  isFirst,
  isLast,
  onClick,
  dag,
  dagGutter,
}: {
  commit: CommitSummary;
  selected: boolean;
  active: boolean;
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
  dag: boolean;
  dagGutter: number;
}) {
  const refs = visibleRefs(commit);

  return (
    <div
      id={`commit-option-${commit.oid}`}
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "group relative flex h-full cursor-default items-start gap-2.5 border-b border-[var(--line-subtle)] py-3 pr-4 transition-colors",
        !dag && "pl-3",
        selected ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-subtle)]",
        selected && "bg-brand/[0.035]",
        active && "ring-1 ring-inset ring-brand/30",
      )}
      style={dag ? { paddingLeft: dagGutter + 8 } : undefined}
    >
      {!dag && (
        <div className="relative flex h-full w-4 shrink-0 justify-center">
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0 w-px bg-[var(--surface-hover)]",
              isFirst
                ? "top-1/2 bottom-0"
                : isLast
                  ? "top-0 bottom-1/2"
                  : "inset-y-0",
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              "relative mt-[5px] size-2 rounded-full border",
              commit.isHead
                ? "border-brand/70 bg-brand shadow-[0_0_0_3px_rgba(232,182,102,0.06)]"
                : selected
                  ? "border-brand/60 bg-brand/35"
                  : "border-[var(--line-strong)] bg-[var(--surface-rail)] group-hover:border-brand/40",
            )}
          />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[11.5px] font-medium leading-5 text-foreground/78 group-hover:text-foreground/95">
            {commit.subject || "（无提交说明）"}
          </span>
          {refs.map((ref) => (
            <span
              key={`${ref.kind}:${ref.name}`}
              className={cn(
                "inline-flex max-w-[90px] shrink-0 items-center gap-1 truncate rounded-[4px] border px-1 py-px font-mono text-[8px] leading-[13px]",
                ref.kind === "branch"
                  ? commit.isHead
                    ? "border-brand/20 bg-brand/[0.08] text-brand/80"
                    : "border-jade/15 bg-jade/[0.055] text-jade/70"
                  : "border-violet/15 bg-violet/[0.055] text-violet/70",
              )}
              title={ref.name}
            >
              {ref.kind === "tag" ? (
                <Tag className="size-2" />
              ) : (
                <GitBranch className="size-2" />
              )}
              <span className="truncate">{ref.name}</span>
            </span>
          ))}
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[8.5px] text-muted-foreground/38">
          <span className="shrink-0 font-mono text-muted-foreground/50">
            {commit.shortOid}
          </span>
          <span className="text-[var(--separator)]">·</span>
          <span className="truncate">{commit.authorName}</span>
          <span className="text-[var(--separator)]">·</span>
          <span className="shrink-0 text-muted-foreground/30">
            {formatRelativeTime(commit.authoredAt)}
          </span>
          {commit.isHead && (
            <span className="ml-auto shrink-0 rounded border border-brand/15 bg-brand/[0.06] px-1 py-px font-mono text-[7.5px] text-brand/65">
              HEAD
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div aria-label="正在加载提交历史" role="status" className="px-3 py-2">
      {Array.from({ length: 9 }, (_, index) => (
        <div key={index} className="flex h-[64px] items-start gap-3 py-2">
          <div className="grid w-4 shrink-0 place-items-center pt-1.5">
            <span className="size-2 animate-pulse rounded-full bg-[var(--surface-hover)]" />
          </div>
          <div className="flex-1 space-y-2">
            <div
              className="h-2.5 animate-pulse rounded bg-[var(--surface-muted)]"
              style={{ width: `${52 + ((index * 11) % 34)}%` }}
            />
            <div
              className="h-2 animate-pulse rounded bg-[var(--surface-subtle)]"
              style={{ width: `${28 + ((index * 7) % 22)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CommitHistory({
  repoPath,
  refreshToken,
  totalCommits,
  selectedOid,
  onSelectCommit,
}: CommitHistoryProps) {
  const [searchInput, setSearchInput] = useState("");
  const [searchPattern, setSearchPattern] = useState("");
  const [view, setView] = useState<HistoryView>("list");
  const history = useCommitHistory(repoPath, refreshToken, searchPattern);
  const dag = useDagLayout(
    history.commits,
    repoPath,
    refreshToken,
    searchPattern,
    view === "dag",
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchPattern(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setSearchInput("");
    setSearchPattern("");
  }, [repoPath]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [repoPath, refreshToken, searchPattern]);

  useEffect(() => {
    if (activeIndex >= history.commits.length) {
      setActiveIndex(history.commits.length - 1);
    }
  }, [activeIndex, history.commits.length]);

  useEffect(() => {
    if (searchPattern || searchInput.trim()) {
      setView("list");
    }
  }, [searchInput, searchPattern]);

  const searchActive =
    searchPattern.length > 0 || searchInput.trim().length > 0;
  const canShowDag = !searchActive && history.commits.length > 0;
  const dagGutter = dagGutterWidth(dag.maxLane);

  const trailing =
    history.error && history.commits.length > 0
      ? "error"
      : !history.error && (history.hasMore || history.isLoadingMore)
        ? "loader"
        : null;
  const rowCount = history.commits.length + (trailing ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    getItemKey: (index) =>
      history.commits[index]?.oid ?? `__trailing_${trailing ?? "none"}__`,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex =
    virtualItems.length > 0
      ? virtualItems[virtualItems.length - 1].index
      : -1;

  const activeCommit =
    activeIndex >= 0 && activeIndex < history.commits.length
      ? history.commits[activeIndex]
      : null;
  const activeRendered = virtualItems.some(
    (item) => item.index === activeIndex,
  );

  const moveActive = (index: number) => {
    if (history.commits.length === 0) {
      return;
    }
    const next = Math.max(0, Math.min(history.commits.length - 1, index));
    setActiveIndex(next);
    virtualizer.scrollToIndex(next, { align: "auto" });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (history.commits.length === 0) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(activeIndex < 0 ? 0 : activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(activeIndex < 0 ? history.commits.length - 1 : activeIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveActive(0);
        break;
      case "End":
        event.preventDefault();
        moveActive(history.commits.length - 1);
        break;
      case "Enter":
      case " ":
        if (activeCommit) {
          event.preventDefault();
          onSelectCommit(activeCommit);
        }
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [refreshToken, repoPath, searchPattern]);

  useEffect(() => {
    if (trailing !== "loader" || lastVirtualIndex < 0) {
      return;
    }
    if (lastVirtualIndex >= Math.max(0, history.commits.length - 3)) {
      void history.loadMore();
    }
  }, [history.commits.length, history.loadMore, lastVirtualIndex, trailing]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface-panel)]">
      <header className="shrink-0 border-b border-[var(--line)] px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] text-brand/55">
              <History className="size-3.5" />
            </div>
            <div>
              <div className="text-[12px] font-medium text-foreground/78">
                提交历史
              </div>
              <div className="mt-0.5 text-[8.5px] text-muted-foreground/32">
                {searchPattern
                  ? `匹配 ${formatCount(history.commits.length)}`
                  : `${formatCount(history.commits.length)} / ${formatCount(totalCommits)}`}
              </div>
            </div>
          </div>
          <div
            role="group"
            aria-label="提交历史视图"
            className="flex shrink-0 items-center gap-0.5 rounded-lg border border-[var(--line)] bg-[var(--well)] p-0.5"
          >
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[8.5px] transition-colors",
                view === "list"
                  ? "bg-[var(--surface-hover)] text-foreground/80"
                  : "text-muted-foreground/40 hover:text-foreground/65",
              )}
            >
              <List className="size-3" />
              列表
            </button>
            <button
              type="button"
              onClick={() => setView("dag")}
              disabled={!canShowDag}
              aria-pressed={view === "dag"}
              title={
                searchActive
                  ? "搜索结果为过滤集合，不连续，DAG 仅支持完整历史"
                  : history.commits.length === 0
                    ? "暂无可展示的提交"
                    : "切换 DAG 视图"
              }
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[8.5px] transition-colors",
                view === "dag"
                  ? "bg-[var(--surface-hover)] text-foreground/80"
                  : "text-muted-foreground/40 hover:text-foreground/65",
                !canShowDag && "cursor-not-allowed opacity-40 hover:text-muted-foreground/40",
              )}
            >
              <GitGraph className="size-3" />
              DAG
            </button>
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/35" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="搜索提交信息"
            aria-label="搜索提交信息"
            className="h-8 pl-8 pr-8 text-[10px]"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="清空搜索"
              className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground/35 hover:bg-[var(--surface-hover)] hover:text-foreground/70"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          role="listbox"
          aria-label="提交历史"
          aria-activedescendant={
            activeCommit && activeRendered
              ? `commit-option-${activeCommit.oid}`
              : undefined
          }
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onMouseDown={() => scrollRef.current?.focus()}
          className="h-full overflow-y-auto overflow-x-hidden overscroll-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand/25"
        >
        {history.isLoading && history.commits.length === 0 ? (
          <LoadingRows />
        ) : history.error && history.commits.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center">
            <TriangleAlert className="size-5 text-rose/65" />
            <div className="mt-3 text-[11px] font-medium text-foreground/70">
              无法加载提交历史
            </div>
            <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground/40">
              {history.error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={history.retry}
            >
              <RotateCw className="size-3" />
              重试
            </Button>
          </div>
        ) : history.commits.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center">
            <History className="size-5 text-muted-foreground/30" />
            <div className="mt-3 text-[11px] font-medium text-foreground/65">
              {searchPattern ? "没有匹配的提交" : "还没有提交"}
            </div>
            <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground/35">
              {searchPattern
                ? "没有找到包含该关键词的提交，试试其他关键词或清空搜索。"
                : "完成第一次提交后，提交历史会出现在这里。"}
            </p>
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualItems.map((item) => {
              const commit = history.commits[item.index];
              if (!commit) {
                if (trailing === "error") {
                  return (
                    <div
                      key={item.key}
                      className="absolute left-0 top-0 flex w-full items-center gap-2 border-b border-[var(--line-subtle)] px-4 text-[9px] text-rose/65"
                      style={{
                        height: item.size,
                        transform: `translateY(${item.start}px)`,
                      }}
                    >
                      <TriangleAlert className="size-3" />
                      <span className="min-w-0 flex-1 truncate">
                        {history.error?.message}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[9px]"
                        onClick={history.retry}
                      >
                        重试
                      </Button>
                    </div>
                  );
                }
                return (
                  <div
                    key={item.key}
                    className="absolute left-0 top-0 flex w-full items-center gap-2 border-b border-[var(--line-subtle)] px-4 text-[9px] text-muted-foreground/35"
                    style={{
                      height: item.size,
                      transform: `translateY(${item.start}px)`,
                    }}
                  >
                    <Loader2 className="size-3 animate-spin text-brand/45" />
                    正在加载更多提交…
                  </div>
                );
              }

              return (
                <div
                  key={item.key}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <CommitRow
                    commit={commit}
                    selected={commit.oid === selectedOid}
                    active={item.index === activeIndex}
                    isFirst={item.index === 0}
                    isLast={
                      item.index === history.commits.length - 1 && !trailing
                    }
                    onClick={() => {
                      setActiveIndex(item.index);
                      onSelectCommit(commit);
                    }}
                    dag={view === "dag"}
                    dagGutter={dagGutter}
                  />
                </div>
              );
            })}
          </div>
        )}
        </div>
        {view === "dag" && history.commits.length > 0 && (
          <DagCanvas
            scrollRef={scrollRef}
            rows={dag.rows}
            maxLane={dag.maxLane}
            rowHeight={ROW_HEIGHT}
            gutterWidth={dagGutter}
            selectedOid={selectedOid}
          />
        )}
      </div>

      <footer className="shrink-0 border-t border-[var(--line-subtle)] px-4 py-2.5 text-[8px] text-muted-foreground/25">
        每页 300 条 · 滚动自动加载
      </footer>
    </section>
  );
}
