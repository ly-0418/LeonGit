import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface NoticeMessage {
  tone: "success" | "warning" | "info";
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NoticeToastProps {
  notice: NoticeMessage;
  onDismiss: () => void;
}

export function NoticeToast({ notice, onDismiss }: NoticeToastProps) {
  const Icon =
    notice.tone === "success"
      ? CheckCircle2
      : notice.tone === "warning"
        ? TriangleAlert
        : Info;

  return (
    <div
      role="status"
      className="rise-in w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-popover)] p-3.5 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl"
    >
      <div className="flex gap-2.5">
        <div
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg border",
            notice.tone === "success" &&
              "border-jade/15 bg-jade/[0.06] text-jade/75",
            notice.tone === "warning" &&
              "border-[var(--warning-border)] bg-[var(--warning-surface)] text-[var(--warning)]",
            notice.tone === "info" &&
              "border-azure/15 bg-azure/[0.06] text-azure/75",
          )}
        >
          <Icon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-foreground/80">
            {notice.title}
          </div>
          <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground/50">
            {notice.message}
          </p>
          {notice.action && (
            <button
              type="button"
              onClick={notice.action.onClick}
              className="mt-2 rounded-md border border-[var(--line)] bg-[var(--surface-subtle)] px-2 py-1 text-[9px] font-medium text-foreground/70 transition-colors hover:bg-[var(--surface-hover)]"
            >
              {notice.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/30 hover:bg-[var(--surface-hover)] hover:text-foreground/60"
          aria-label="关闭提示"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
