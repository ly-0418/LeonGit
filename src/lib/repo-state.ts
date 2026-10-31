import type { RepoState } from "@/types/git";

export interface RepoStateInfo {
  label: string;
  description: string;
  /** Whether a new merge/checkout/pull etc. must be rejected. */
  blocksOperations: boolean;
  /** Whether a normal commit must be rejected. */
  blocksCommit: boolean;
}

export const REPO_STATE_INFO: Record<RepoState, RepoStateInfo> = {
  normal: {
    label: "正常",
    description: "",
    blocksOperations: false,
    blocksCommit: false,
  },
  merging: {
    label: "merge 进行中",
    description:
      "存在未完成的合并。请先完成或中止 merge：解决冲突后提交会结束 merge，也可以中止 merge 回到合并前状态。",
    blocksOperations: true,
    blocksCommit: false,
  },
  rebasing: {
    label: "rebase 进行中",
    description:
      "请先在命令行执行 git rebase --continue 或 git rebase --abort；客户端不会自动继续 rebase。",
    blocksOperations: true,
    blocksCommit: true,
  },
  cherryPicking: {
    label: "cherry-pick 进行中",
    description:
      "请先在命令行执行 git cherry-pick --continue 或 git cherry-pick --abort。",
    blocksOperations: true,
    blocksCommit: true,
  },
  reverting: {
    label: "revert 进行中",
    description:
      "在提交详情的 Revert 操作中使用 continue 或 abort 完成当前 revert。",
    blocksOperations: true,
    blocksCommit: true,
  },
  bisecting: {
    label: "bisect 进行中",
    description:
      "当前正在二分查找。请先在命令行执行 git bisect reset 结束，再继续写入操作。",
    blocksOperations: true,
    blocksCommit: true,
  },
  detachedHead: {
    label: "detached HEAD",
    description:
      "当前不在任何分支上，提交会产生游离 commit。请先创建新分支保存提交，或确认继续；后续可随时回到已有分支。",
    blocksOperations: false,
    blocksCommit: false,
  },
  amInProgress: {
    label: "rebase apply 进行中",
    description:
      "当前有 `git am` / rebase apply 未完成。请先在命令行完成或中止，再继续写入操作。",
    blocksOperations: true,
    blocksCommit: true,
  },
};

export function repoStateInfo(state: RepoState): RepoStateInfo {
  return REPO_STATE_INFO[state];
}

export function repoStateBlockMessage(state: RepoState, action: string): string {
  const info = repoStateInfo(state);
  return `${action}已阻止：当前处于 ${info.label}。${info.description}`;
}
