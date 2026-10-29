import { Check, Moon, Sun, Type } from "lucide-react";
import type { CSSProperties } from "react";

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
import { cn } from "@/lib/utils";
import {
  FONT_MAX_PX,
  FONT_MIN_PX,
  fontPxToScale,
  fontScaleToPx,
  type FontScale,
  type ThemeMode,
} from "@/types/ui";

interface AppearanceSettingsDialogProps {
  open: boolean;
  theme: ThemeMode;
  fontScale: FontScale;
  onOpenChange: (open: boolean) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onFontScaleChange: (scale: FontScale) => void;
}

export function AppearanceSettingsDialog({
  open,
  theme,
  fontScale,
  onOpenChange,
  onThemeChange,
  onFontScaleChange,
}: AppearanceSettingsDialogProps) {
  const fontPx = fontScaleToPx(fontScale);
  const fontProgress =
    ((fontPx - FONT_MIN_PX) / (FONT_MAX_PX - FONT_MIN_PX)) * 100;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="grid size-9 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] text-brand/80">
            <Type className="size-4" />
          </div>
          <DialogTitle>界面设置</DialogTitle>
          <DialogDescription>
            主题只保留亮色与暗色两档；字体大小按 1px 步进调节，不会改变布局结构。
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-5">
            <section>
              <div className="mb-2 text-[10px] font-medium text-foreground/65">
                主题
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ThemeOption
                  active={theme === "light"}
                  icon={Sun}
                  title="亮色"
                  description="白天与浅色桌面环境"
                  onClick={() => onThemeChange("light")}
                />
                <ThemeOption
                  active={theme === "dark"}
                  icon={Moon}
                  title="暗色"
                  description="低光环境与夜间使用"
                  onClick={() => onThemeChange("dark")}
                />
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-medium text-foreground/65">
                  字体大小
                </span>
                <span className="rounded-md border border-brand/20 bg-brand/[0.06] px-2 py-1 font-mono text-[11px] leading-none text-brand">
                  {fontPx}px
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[8px] text-muted-foreground/35">
                  {FONT_MIN_PX}px
                </span>
                <input
                  type="range"
                  min={FONT_MIN_PX}
                  max={FONT_MAX_PX}
                  step={1}
                  value={fontPx}
                  onChange={(event) =>
                    onFontScaleChange(fontPxToScale(Number(event.target.value)))
                  }
                  aria-label="字体大小"
                  aria-valuetext={`${fontPx}px`}
                  className="font-slider h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/35"
                  style={
                    {
                      "--slider-progress": `${fontProgress}%`,
                    } as CSSProperties
                  }
                />
                <span className="font-mono text-[8px] text-muted-foreground/35">
                  {FONT_MAX_PX}px
                </span>
              </div>
              <div className="mt-2 text-[8.5px] leading-relaxed text-muted-foreground/35">
                拖动滑块即时预览
              </div>
            </section>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-3">
              <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/35">
                Preview
              </div>
              <div className="mt-2 text-[13px] font-medium text-foreground/85">
                feat: 让工作区更顺手
              </div>
              <div className="mt-1 text-[9.5px] text-muted-foreground/50">
                当前主题与字号会立即应用，并保存到本机配置。
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            <Check />
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThemeOption({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: typeof Sun;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-brand/40",
        active
          ? "border-brand/30 bg-brand/[0.06]"
          : "border-[var(--line)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-muted)]",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg border",
          active
            ? "border-brand/20 bg-brand/[0.08] text-brand"
            : "border-[var(--line)] bg-[var(--surface-muted)] text-muted-foreground/50",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10.5px] font-medium text-foreground/75">
          {title}
        </span>
        <span className="mt-1 block text-[8.5px] leading-relaxed text-muted-foreground/40">
          {description}
        </span>
      </span>
      {active && <Check className="ml-auto size-3.5 shrink-0 text-brand" />}
    </button>
  );
}
