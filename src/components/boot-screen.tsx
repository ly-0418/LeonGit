import { Loader2 } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

export function BootScreen() {
  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="app-grid absolute inset-0 opacity-45" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_42%,rgba(232,182,102,0.055),transparent_70%)]" />
      </div>
      <div className="relative flex flex-col items-center">
        <BrandMark className="size-14 rounded-[18px] shadow-[0_22px_55px_-20px_rgba(0,0,0,0.95)]" />
        <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground/60">
          <Loader2 className="size-3.5 animate-spin text-brand/60" />
          正在恢复最近打开的仓库…
        </div>
        <div className="mt-2 text-[9px] text-muted-foreground/30">
          读取分支、工作区状态与文件清单
        </div>
      </div>
    </div>
  );
}
