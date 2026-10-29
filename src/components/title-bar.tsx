import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Palette,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "@/types/ui";

interface TitleBarProps {
  repositoryName?: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenAppearance: () => void;
}

export function TitleBar({
  repositoryName,
  theme,
  onToggleTheme,
  onOpenAppearance,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void appWindow.isMaximized().then((value) => {
      if (!cancelled) {
        setMaximized(value);
      }
    });
    void appWindow
      .onResized(() => {
        void appWindow.isMaximized().then((value) => {
          if (!cancelled) {
            setMaximized(value);
          }
        });
      })
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch((error: unknown) => {
        console.error("无法监听窗口尺寸", error);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const toggleMaximize = () => {
    const appWindow = getCurrentWindow();
    void appWindow.toggleMaximize().catch((error: unknown) => {
      console.error("无法切换窗口最大化", error);
    });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-8 select-none items-center border-b border-[var(--line)] bg-[var(--titlebar-bg)] text-foreground/80 backdrop-blur-xl">
      <div
        data-tauri-drag-region="deep"
        className="flex h-full min-w-0 flex-1 items-center gap-2 px-3"
      >
        <BrandMark className="size-4 rounded-[5px]" />
        <span className="shrink-0 text-[10px] font-semibold tracking-[-0.01em] text-foreground/78">
          LeonGit
        </span>
        {repositoryName && (
          <>
            <span className="text-[9px] text-muted-foreground/20">/</span>
            <span className="min-w-0 truncate text-[9px] text-muted-foreground/40">
              {repositoryName}
            </span>
          </>
        )}
      </div>

      <div className="flex h-full shrink-0 items-center">
        <TitleBarAction
          label={theme === "dark" ? "切换到亮色主题" : "切换到暗色主题"}
          onClick={onToggleTheme}
          icon={theme === "dark" ? Sun : Moon}
        />
        <TitleBarAction
          label="界面设置"
          onClick={onOpenAppearance}
          icon={Palette}
        />
        <WindowButton
          label="最小化"
          onClick={() => {
            void getCurrentWindow()
              .minimize()
              .catch((error: unknown) => {
                console.error("无法最小化窗口", error);
              });
          }}
          icon={Minus}
        />
        <WindowButton
          label={maximized ? "还原" : "最大化"}
          onClick={toggleMaximize}
          icon={maximized ? Minimize2 : Maximize2}
        />
        <WindowButton
          label="关闭"
          onClick={() => {
            void getCurrentWindow()
              .close()
              .catch((error: unknown) => {
                console.error("无法关闭窗口", error);
              });
          }}
          icon={X}
          danger
        />
      </div>
    </header>
  );
}

function WindowButton({
  label,
  onClick,
  icon: Icon,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Minus;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      data-no-drag
      className={cn(
        "grid h-full w-10 place-items-center text-muted-foreground/50 outline-none transition-colors",
        danger
          ? "hover:bg-rose/[0.12] hover:text-rose"
          : "hover:bg-[var(--surface-hover)] hover:text-foreground/80",
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function TitleBarAction({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Sun;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      data-no-drag
      className="grid h-full w-8 place-items-center text-muted-foreground/50 outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground/80"
    >
      <Icon className="size-3.5" />
    </button>
  );
}
