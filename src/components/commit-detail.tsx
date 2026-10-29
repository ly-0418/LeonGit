import {
  ArrowLeft,
  Clock,
  FileText,
  GitBranch,
  Tag,
  TriangleAlert,
  UserRound,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { DiffLines } from "@/components/diff-lines";
import { useCommitDetail } from "@/hooks/use-commit-detail";
import { changeBadgeClass, CHANGE_LABELS } from "@/lib/changes";
import {
  fileName,
  formatAbsoluteTime,
  formatCount,
  formatRelativeTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommitFileChange } from "@/types/git";

interface CommitDetailProps {
  repoPath: string;
  oid: string;
  onBack: () => void;
  onRevert: (oid: string) => void;
}

function CommitFileRow({
  file,
  selected,
  onClick,
}: {
  file: CommitFileChange;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 border-t border-[var(--line-subtle)] px-3 py-2 text-left outline-none transition-colors first:border-t-0 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)]",
        selected && "bg-brand/[0.035]",
      )}
    >
      <FileText
        className={cn(
          "size-3.5 shrink-0",
          selected ? "text-brand/65" : "text-muted-foreground/30",
        )}
      />
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground/70">
        {file.path}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-[4px] border px-1 py-px text-[8px] leading-none",
          changeBadgeClass(file.change),
        )}
      >
        {CHANGE_LABELS[file.change]}
      </span>
    </button>
  );
}

export function CommitDetail({
  repoPath,
  oid,
  onBack,
  onRevert,
}: CommitDetailProps) {
  const controller = useCommitDetail(repoPath, oid);
  const detail = controller.detail;

  const body = useMemo(() => {
    if (!detail) {
      return "";
    }
    const lines = detail.message.replace(/\r\n/g, "\n").split("\n");
    return lines.slice(1).join("\n").trim();
  }, [detail]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-[var(--line)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/55"
            onClick={onBack}
            aria-label="返回工作区"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-foreground/80">
                提交详情
              </span>
              {detail && (
                <span className="rounded border border-[var(--line)] bg-[var(--surface-subtle)] px-1.5 py-px font-mono text-[9px] text-muted-foreground/45">
                  {detail.shortOid}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[9px] text-muted-foreground/35">
              {detail?.subject ?? "读取提交信息…"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/55"
            onClick={() => detail && onRevert(detail.oid)}
            disabled={!detail || controller.isLoading}
            aria-label="Revert 此提交"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/55"
            onClick={controller.retry}
            disabled={controller.isLoading}
            aria-label="重新加载提交详情"
          >
            <RotateCw
              className={cn(
                "size-3.5",
                controller.isLoading && "animate-spin",
              )}
            />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {controller.isLoading ? (
          <div className="space-y-4 p-5" role="status" aria-label="加载提交详情">
            <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--surface-hover)]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="h-20 animate-pulse rounded-xl bg-[var(--surface-subtle)]" />
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="h-8 animate-pulse rounded-lg bg-[var(--surface-subtle)]"
                />
              ))}
            </div>
          </div>
        ) : controller.error ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="grid size-11 place-items-center rounded-xl border border-rose/15 bg-rose/[0.06] text-rose/75">
              <TriangleAlert className="size-5" />
            </div>
            <h3 className="mt-4 text-[13px] font-medium text-foreground/80">
              无法加载提交详情
            </h3>
            <p className="mt-1.5 max-w-[380px] text-[10.5px] leading-relaxed text-muted-foreground/50">
              {controller.error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={controller.retry}
            >
              <RotateCw className="size-3.5" />
              重试
            </Button>
          </div>
        ) : detail ? (
          <>
            <div className="border-b border-[var(--line-subtle)] px-5 py-5">
              <h2 className="text-[16px] font-semibold leading-6 tracking-[-0.015em] text-foreground/90">
                {detail.subject}
              </h2>

              {detail.refs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {detail.refs.map((ref) => (
                    <span
                      key={`${ref.kind}:${ref.name}`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded border px-1.5 py-px text-[8px]",
                        ref.kind === "branch"
                          ? "border-brand/15 bg-brand/[0.05] text-brand/70"
                          : ref.kind === "tag"
                            ? "border-violet/15 bg-violet/[0.05] text-violet/70"
                            : "border-azure/15 bg-azure/[0.05] text-azure/65",
                      )}
                    >
                      {ref.kind === "tag" ? (
                        <Tag className="size-2" />
                      ) : (
                        <GitBranch className="size-2" />
                      )}
                      {ref.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 grid gap-2 text-[9.5px] text-muted-foreground/45 sm:grid-cols-2">
                <div className="flex items-center gap-1.5">
                  <UserRound className="size-3" />
                  <span className="truncate text-foreground/65">
                    {detail.authorName}
                  </span>
                  <span className="truncate text-muted-foreground/30">
                    &lt;{detail.authorEmail}&gt;
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:justify-end">
                  <Clock className="size-3" />
                  <span title={formatAbsoluteTime(detail.authoredAt)}>
                    {formatAbsoluteTime(detail.authoredAt)}
                  </span>
                  <span className="text-muted-foreground/25">·</span>
                  <span>{formatRelativeTime(detail.authoredAt)}</span>
                </div>
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--line-subtle)] bg-[var(--well)] px-3 py-2">
                <span className="shrink-0 pt-px text-[8px] uppercase tracking-[0.12em] text-muted-foreground/30">
                  SHA
                </span>
                <span className="break-all font-mono text-[9.5px] leading-relaxed text-muted-foreground/60">
                  {detail.oid}
                </span>
              </div>

              {body && (
                <pre className="mt-3 whitespace-pre-wrap font-sans text-[10.5px] leading-relaxed text-muted-foreground/55">
                  {body}
                </pre>
              )}
            </div>

            <div className="px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-medium text-foreground/60">
                  变更文件
                </span>
                <span className="font-mono text-[8.5px] text-muted-foreground/30">
                  {formatCount(detail.files.length)}
                </span>
              </div>

              {detail.files.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-[9.5px] text-muted-foreground/35">
                  该提交没有可展示的文件变更。
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)]">
                  {detail.files.map((file) => (
                    <CommitFileRow
                      key={`${file.path}:${file.originalPath ?? ""}`}
                      file={file}
                      selected={
                        controller.selectedFile?.path === file.path &&
                        controller.selectedFile?.originalPath ===
                          file.originalPath
                      }
                      onClick={() => controller.selectFile(file)}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-deep)]">
                <div className="flex items-center justify-between border-b border-[var(--line-subtle)] px-3 py-2">
                  <span className="min-w-0 truncate font-mono text-[9px] text-muted-foreground/40">
                    {controller.selectedFile?.path ?? "选择文件查看 diff"}
                  </span>
                  {controller.selectedFile?.originalPath && (
                    <span className="ml-2 shrink-0 font-mono text-[8px] text-muted-foreground/25">
                      ← {fileName(controller.selectedFile.originalPath)}
                    </span>
                  )}
                </div>

                {controller.isFileLoading ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 8 }, (_, index) => (
                      <div
                        key={index}
                        className="h-2.5 animate-pulse rounded bg-[var(--surface-muted)]"
                        style={{ width: `${40 + ((index * 13) % 48)}%` }}
                      />
                    ))}
                  </div>
                ) : controller.fileError ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-[9.5px] text-rose/65">
                    <TriangleAlert className="size-3.5" />
                    {controller.fileError.message}
                  </div>
                ) : controller.fileDiff &&
                  controller.fileDiff.lines.length > 0 ? (
                  <div className="overflow-x-auto">
                    <DiffLines
                      lines={controller.fileDiff.lines}
                      isBinary={controller.fileDiff.isBinary}
                      truncated={controller.fileDiff.truncated}
                    />
                  </div>
                ) : (
                  <div className="px-3 py-6 text-center text-[9px] text-muted-foreground/30">
                    该文件在此提交中没有可展示的文本 diff。
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground/35">
            选择提交以查看详情
          </div>
        )}
      </div>
    </section>
  );
}
