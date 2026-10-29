import { FolderOpen } from "lucide-react";

export function DragOverlay() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--surface-app)] p-8 backdrop-blur-[4px]">
      <div className="flex h-full w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-brand/45 bg-brand/[0.035] shadow-[inset_0_0_120px_rgba(232,182,102,0.05)]">
        <div className="grid size-16 place-items-center rounded-2xl border border-brand/25 bg-brand/[0.08] text-brand/85">
          <FolderOpen className="size-7" />
        </div>
        <div className="mt-5 text-[16px] font-medium text-foreground/85">
          松开以打开 Git 仓库
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground/45">
          仅支持包含 .git 的本地仓库文件夹
        </div>
      </div>
    </div>
  );
}
