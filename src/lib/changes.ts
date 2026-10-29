import type { FileChangeKind } from "@/types/git";

export const CHANGE_LABELS: Record<FileChangeKind, string> = {
  modified: "修改",
  added: "新增",
  deleted: "删除",
  renamed: "重命名",
  copied: "复制",
  typeChanged: "类型变更",
  untracked: "未跟踪",
  conflicted: "冲突",
  other: "变更",
};

export function changeBadgeClass(change: FileChangeKind): string {
  switch (change) {
    case "added":
    case "untracked":
      return "border-jade/20 bg-jade/[0.08] text-jade/90";
    case "deleted":
    case "conflicted":
      return "border-rose/20 bg-rose/[0.08] text-rose/90";
    case "renamed":
    case "copied":
      return "border-azure/20 bg-azure/[0.08] text-azure/85";
    case "typeChanged":
      return "border-violet/20 bg-violet/[0.08] text-violet/85";
    default:
      return "border-brand/20 bg-brand/[0.08] text-brand/90";
  }
}
