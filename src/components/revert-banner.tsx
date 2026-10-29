import { Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface RevertBannerProps {
  conflicts: number;
  isBusy: boolean;
  onContinue: () => void;
  onAbort: () => void;
}

export function RevertBanner({
  conflicts,
  isBusy,
  onContinue,
  onAbort,
}: RevertBannerProps) {
  const [confirmAbort, setConfirmAbort] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--warning-border)] bg-[var(--warning-surface)] px-4 py-2 text-[9.5px] text-[var(--warning)]">
      <RotateCcw className="size-3.5 shrink-0" />
      <span className="font-medium">revert 进行中</span>
      {conflicts > 0 ? (
        <span className="inline-flex items-center gap-1 text-rose/75">
          <TriangleAlert className="size-3" />
          {conflicts} 个冲突文件待解决
        </span>
      ) : (
        <span className="text-muted-foreground/45">冲突已解决，可继续</span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {confirmAbort ? (
          <>
            <span className="text-rose/75">确认中止并丢弃当前 revert 状态？</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[8.5px] text-rose/75"
              onClick={() => {
                setConfirmAbort(false);
                onAbort();
              }}
              disabled={isBusy}
            >
              确认中止
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[8.5px]"
              onClick={() => setConfirmAbort(false)}
              disabled={isBusy}
            >
              取消
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              className="h-6 gap-1 px-2 text-[8.5px]"
              onClick={onContinue}
              disabled={isBusy}
            >
              {isBusy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              继续 Revert
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[8.5px] text-rose/70"
              onClick={() => setConfirmAbort(true)}
              disabled={isBusy}
            >
              中止 Revert
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
