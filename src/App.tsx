import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";

import { AmendCommitDialog } from "@/components/amend-commit-dialog";
import { BlameDialog } from "@/components/blame-dialog";
import { BootScreen } from "@/components/boot-screen";
import { AppearanceSettingsDialog } from "@/components/appearance-settings-dialog";
import { BranchCreateDialog } from "@/components/branch-create-dialog";
import { BranchDeleteDialog } from "@/components/branch-delete-dialog";
import { BranchRenameDialog } from "@/components/branch-rename-dialog";
import { CloneRepositoryDialog } from "@/components/clone-repository-dialog";
import { CommitDialog } from "@/components/commit-dialog";
import { CommitHistory } from "@/components/commit-history";
import { DetailsPanel } from "@/components/details-panel";
import { DiscardDialog } from "@/components/discard-dialog";
import { FileHistoryDialog } from "@/components/file-history-dialog";
import { DragOverlay } from "@/components/drag-overlay";
import { ErrorBanner } from "@/components/error-banner";
import { InitRepositoryDialog, repositoryName } from "@/components/init-repository-dialog";
import { MergeBranchDialog } from "@/components/merge-branch-dialog";
import { NoticeToast, type NoticeMessage } from "@/components/notice-toast";
import { PushConfirmDialog } from "@/components/push-confirm-dialog";
import { ReflogDialog } from "@/components/reflog-dialog";
import { RemoteBranchDialog } from "@/components/remote-branch-dialog";
import { RemoteDialog } from "@/components/remote-dialog";
import { RepositorySettingsDialog } from "@/components/repository-settings-dialog";
import { RevertConfirmDialog } from "@/components/revert-confirm-dialog";
import { TagDialog } from "@/components/tag-dialog";
import { TitleBar } from "@/components/title-bar";
import { WelcomeScreen } from "@/components/welcome-screen";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import type { SelectedFile } from "@/hooks/use-file-diff";
import { useRepository } from "@/hooks/use-repository";
import { useRepositoryRefs } from "@/hooks/use-repository-refs";
import { useUiState } from "@/hooks/use-ui-state";
import {
  amendCommit,
  checkoutBranch,
  commitAndPush,
  deleteBranch,
  discardFile as discardFileCommand,
  discardLines,
  fetchRemote,
  markConflictResolved,
  mergeBranch,
  openMergeTool,
  openRepository,
  pullCurrentBranch,
  pushCurrentBranch,
  renameBranch,
  restoreRemoteBranch,
  revertAbort,
  revertCommit,
  revertContinue,
  stageFile,
  stageHunk,
  unstageFile,
  unstageHunk,
  type CommitAuthor,
} from "@/lib/git-api";
import type {
  BranchInfo,
  CommitPushResult,
  CommitResult,
  CommitSummary,
  DiffScope,
  RemoteInfo,
  RepositorySnapshot,
  StatusFile,
  SyncAction,
} from "@/types/git";

function worktreeChangeCount(snapshot: RepositorySnapshot): number {
  const summary = snapshot.workingTree;
  return (
    summary.staged + summary.unstaged + summary.untracked + summary.conflicted
  );
}

export default function App() {
  const ui = useUiState();
  const {
    snapshot,
    error,
    isOpening,
    isRefreshing,
    openPath,
    adopt,
    refresh,
    clear,
    reportError,
    dismissError,
  } = useRepository();

  const [isRestoring, setIsRestoring] = useState(true);
  const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [isAmending, setIsAmending] = useState(false);
  const [branchCreateOpen, setBranchCreateOpen] = useState(false);
  const [branchDeleteTarget, setBranchDeleteTarget] =
    useState<BranchInfo | null>(null);
  const [branchRenameTarget, setBranchRenameTarget] =
    useState<BranchInfo | null>(null);
  const [mergeTarget, setMergeTarget] = useState<BranchInfo | null>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteBranchesOpen, setRemoteBranchesOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [reflogOpen, setReflogOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [selectedCommitOid, setSelectedCommitOid] = useState<string | null>(
    null,
  );
  const [fileHistoryPath, setFileHistoryPath] = useState<string | null>(null);
  const [blamePath, setBlamePath] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [revertTarget, setRevertTarget] = useState<string | null>(null);
  const [revertBusy, setRevertBusy] = useState(false);
  const [scope, setScope] = useState<DiffScope>("worktree");
  const [indexRevision, setIndexRevision] = useState(0);
  const [discardTarget, setDiscardTarget] = useState<StatusFile | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [actionPath, setActionPath] = useState<string | null>(null);
  const [branchBusy, setBranchBusy] = useState(false);
  const [syncAction, setSyncAction] = useState<SyncAction | null>(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [refsRefreshToken, setRefsRefreshToken] = useState(0);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const choosingRef = useRef(false);
  const restoreStarted = useRef(false);
  const mutationRef = useRef(false);
  const activeRepoPathRef = useRef<string | null>(null);

  const {
    branches,
    remotes,
    isLoading: refsLoading,
    error: refsError,
    reload: reloadRefs,
  } = useRepositoryRefs(snapshot?.path ?? null, refsRefreshToken);

  const isSyncing = syncAction !== null;
  const isBusy = isOpening || branchBusy || isSyncing || isMutating;

  useEffect(() => {
    activeRepoPathRef.current = activeRepoPath;
  }, [activeRepoPath]);

  const resetRepositoryState = useCallback(() => {
    setSelected(null);
    setSelectedCommitOid(null);
    setFileHistoryPath(null);
    setBlamePath(null);
    setTagsOpen(false);
    setRevertTarget(null);
    setRevertBusy(false);
    setScope("worktree");
    setCommitOpen(false);
    setAmendOpen(false);
    setIsAmending(false);
    setBranchCreateOpen(false);
    setBranchDeleteTarget(null);
    setBranchRenameTarget(null);
    setMergeTarget(null);
    setRemoteOpen(false);
    setRemoteBranchesOpen(false);
    setPushOpen(false);
    setReflogOpen(false);
    setDiscardTarget(null);
    setIsDiscarding(false);
    setActionPath(null);
    setNotice(null);
    setHistoryRefreshToken((token) => token + 1);
    setRefsRefreshToken((token) => token + 1);
  }, []);

  const refreshRefs = useCallback(() => {
    setRefsRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(
      () => setNotice(null),
      notice.action ? 12000 : 6000,
    );
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openRepositoryPath = useCallback(
    async (path: string) => {
      if (isMutating || isSyncing || branchBusy) {
        setNotice({
          tone: "info",
          title: "当前操作进行中",
          message: "请等待当前 Git 操作完成后再切换仓库。",
        });
        return null;
      }

      const next = await openPath(path);
      if (next) {
        activeRepoPathRef.current = next.path;
        setActiveRepoPath(next.path);
        ui.addRepository(next);
        resetRepositoryState();
      }
      return next;
    },
    [
      branchBusy,
      isMutating,
      isSyncing,
      openPath,
      resetRepositoryState,
      ui.addRepository,
    ],
  );

  useEffect(() => {
    if (ui.isLoading || restoreStarted.current) {
      return;
    }
    restoreStarted.current = true;

    const first = ui.repos[0]?.path;
    if (!first) {
      setIsRestoring(false);
      return;
    }

    let cancelled = false;
    void openRepositoryPath(first).finally(() => {
      if (!cancelled) {
        setIsRestoring(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [openRepositoryPath, ui.isLoading, ui.repos]);

  const chooseRepository = useCallback(async () => {
    if (choosingRef.current || isOpening) {
      return;
    }
    choosingRef.current = true;
    try {
      const selectedPath = await openDialog({
        directory: true,
        multiple: false,
        title: "打开 Git 仓库",
      });
      if (typeof selectedPath === "string") {
        await openRepositoryPath(selectedPath);
      }
    } catch (rawError) {
      reportError(rawError);
    } finally {
      choosingRef.current = false;
    }
  }, [isOpening, openRepositoryPath, reportError]);

  const handleCloned = useCallback(
    (next: RepositorySnapshot) => {
      adopt(next, true);
      activeRepoPathRef.current = next.path;
      setActiveRepoPath(next.path);
      ui.addRepository(next);
      resetRepositoryState();
    },
    [adopt, resetRepositoryState, ui.addRepository],
  );

  const handleInitialized = useCallback(
    (path: string) => {
      ui.addRepositoryPath(path, repositoryName(path));
      setNotice({
        tone: "success",
        title: "仓库已初始化",
        message: "已加入仓库列表；没有自动打开。",
      });
    },
    [ui.addRepositoryPath],
  );

  const refreshAll = useCallback(async () => {
    if (!snapshot || isRefreshing) {
      return;
    }
    await refresh();
    setHistoryRefreshToken((token) => token + 1);
    refreshRefs();
  }, [isRefreshing, refresh, refreshRefs, snapshot]);

  const handleSelectFile = useCallback(
    (file: StatusFile, defaultScope: DiffScope) => {
      setSelected({ file, defaultScope });
      setScope(defaultScope);
      setSelectedCommitOid(null);
    },
    [],
  );

  const handleSelectCommit = useCallback((commit: CommitSummary) => {
    setSelectedCommitOid(commit.oid);
    setSelected(null);
  }, []);

  const refreshIndexView = useCallback(
    async (next?: RepositorySnapshot) => {
      try {
        const latest =
          next ?? (snapshot ? await openRepository(snapshot.path) : undefined);
        if (latest) {
          adopt(latest);
        }
      } finally {
        // Even when snapshot refresh fails, force the diff hooks to reload so
        // the UI cannot keep showing a stale hunk after the index changed.
        setIndexRevision((revision) => revision + 1);
      }
    },
    [adopt, snapshot],
  );

  const runWorktreeAction = useCallback(
    async (
      file: StatusFile,
      action: () => Promise<RepositorySnapshot>,
      successNotice?: NoticeMessage,
    ) => {
      if (mutationRef.current) {
        return;
      }
      mutationRef.current = true;
      setIsMutating(true);
      setActionPath(file.path);
      try {
        const next = await action();
        await refreshIndexView(next);
        if (successNotice) {
          setNotice(successNotice);
        }
      } catch (rawError) {
        reportError(rawError);
      } finally {
        mutationRef.current = false;
        setIsMutating(false);
        setActionPath(null);
      }
    },
    [refreshIndexView, reportError],
  );

  const handleStage = useCallback(
    (file: StatusFile) => {
      if (!snapshot) return;
      void runWorktreeAction(file, () =>
        stageFile(snapshot.path, file.path),
      );
    },
    [runWorktreeAction, snapshot],
  );

  const handleUnstage = useCallback(
    (file: StatusFile) => {
      if (!snapshot) return;
      void runWorktreeAction(file, () =>
        unstageFile(snapshot.path, file.path, file.originalPath),
      );
    },
    [runWorktreeAction, snapshot],
  );

  const handleStageHunks = useCallback(
    async (filePath: string, patch: string): Promise<boolean> => {
      if (!snapshot || mutationRef.current) {
        return false;
      }
      mutationRef.current = true;
      setIsMutating(true);
      setActionPath(filePath);
      try {
        await stageHunk(snapshot.path, filePath, patch);
        await refreshIndexView();
        return true;
      } catch (rawError) {
        reportError(rawError);
        return false;
      } finally {
        mutationRef.current = false;
        setIsMutating(false);
        setActionPath(null);
      }
    },
    [refreshIndexView, reportError, snapshot],
  );

  const handleUnstageHunks = useCallback(
    async (filePath: string, patch: string): Promise<boolean> => {
      if (!snapshot || mutationRef.current) {
        return false;
      }
      mutationRef.current = true;
      setIsMutating(true);
      setActionPath(filePath);
      try {
        await unstageHunk(snapshot.path, filePath, patch);
        await refreshIndexView();
        return true;
      } catch (rawError) {
        reportError(rawError);
        return false;
      } finally {
        mutationRef.current = false;
        setIsMutating(false);
        setActionPath(null);
      }
    },
    [refreshIndexView, reportError, snapshot],
  );

  const handleDiscardLines = useCallback(
    async (filePath: string, patch: string): Promise<boolean> => {
      if (!snapshot || mutationRef.current) {
        return false;
      }
      mutationRef.current = true;
      setIsMutating(true);
      setActionPath(filePath);
      try {
        await discardLines(snapshot.path, filePath, patch);
        await refreshIndexView();
        return true;
      } catch (rawError) {
        reportError(rawError);
        return false;
      } finally {
        mutationRef.current = false;
        setIsMutating(false);
        setActionPath(null);
      }
    },
    [refreshIndexView, reportError, snapshot],
  );

  const stageAll = useCallback(async () => {
    if (!snapshot || mutationRef.current || isSyncing || branchBusy) {
      return;
    }
    const files = [...snapshot.files.unstaged, ...snapshot.files.untracked];
    if (files.length === 0) {
      return;
    }

    mutationRef.current = true;
    setIsMutating(true);
    setActionPath(null);
    let next = snapshot;
    try {
      for (const file of files) {
        next = await stageFile(snapshot.path, file.path);
      }
      await refreshIndexView(next);
      setNotice({
        tone: "success",
        title: "已暂存全部文件",
        message: `${files.length} 个文件已进入暂存区。`,
      });
    } catch (rawError) {
      await refreshIndexView(next);
      reportError(rawError);
    } finally {
      mutationRef.current = false;
      setIsMutating(false);
      setActionPath(null);
    }
  }, [branchBusy, isSyncing, refreshIndexView, reportError, snapshot]);

  const handleDiscardRequest = useCallback((file: StatusFile) => {
    setDiscardTarget(file);
  }, []);

  const confirmDiscard = useCallback(async () => {
    if (!snapshot || !discardTarget || isDiscarding) {
      return;
    }
    setIsDiscarding(true);
    try {
      const next = await discardFileCommand(
        snapshot.path,
        discardTarget.path,
        discardTarget.originalPath,
      );
      adopt(next);
      setDiscardTarget(null);
    } catch (rawError) {
      reportError(rawError);
    } finally {
      setIsDiscarding(false);
    }
  }, [adopt, discardTarget, isDiscarding, reportError, snapshot]);

  const handleCommitted = useCallback(
    (result: CommitResult) => {
      adopt(result.snapshot);
      setSelected(null);
      setSelectedCommitOid(null);
      setScope("worktree");
      setHistoryRefreshToken((token) => token + 1);
      refreshRefs();
    },
    [adopt, refreshRefs],
  );

  const handleCommitAndPush = useCallback(
    async (
      title: string,
      body: string,
      author: CommitAuthor | null,
      noVerify: boolean,
    ): Promise<CommitPushResult> => {
      if (!snapshot) {
        throw { kind: "invalidInput", message: "当前没有打开的仓库。" };
      }
      const result = await commitAndPush(
        snapshot.path,
        title,
        body,
        author,
        noVerify,
      );
      adopt(result.snapshot);
      setSelected(null);
      setSelectedCommitOid(null);
      setScope("worktree");
      setHistoryRefreshToken((token) => token + 1);
      refreshRefs();
      if (result.push === "success") {
        setNotice({
          tone: "success",
          title: "提交并推送成功",
          message: `${result.commitShortSha} 已推送。`,
        });
      } else {
        setNotice({
          tone: "warning",
          title: "提交成功，推送失败",
          message: `${result.pushMessage} 提交 ${result.commitShortSha} 已保留；可在远程区点击 Push 重试。`,
          action: {
            label: "重试 Push",
            onClick: () => {
              setNotice(null);
              setPushOpen(true);
            },
          },
        });
      }
      return result;
    },
    [adopt, refreshRefs, snapshot],
  );

  const handleAmend = useCallback(
    async (message: string | null, includeStaged: boolean): Promise<boolean> => {
      if (!snapshot || isAmending) {
        return false;
      }
      setIsAmending(true);
      try {
        await amendCommit(snapshot.path, message, includeStaged);
        await refreshIndexView();
        setSelected(null);
        setSelectedCommitOid(null);
        setScope("worktree");
        setHistoryRefreshToken((token) => token + 1);
        refreshRefs();
        setNotice({
          tone: "success",
          title: "最近一次提交已 Amend",
          message: message
            ? "提交消息与内容已更新；未执行 push。"
            : "提交内容已更新，提交消息保持不变；未执行 push。",
        });
        return true;
      } catch (rawError) {
        reportError(rawError);
        return false;
      } finally {
        setIsAmending(false);
      }
    },
    [isAmending, refreshIndexView, refreshRefs, reportError, snapshot],
  );

  const handleCheckout = useCallback(
    async (branch: BranchInfo) => {
      if (!snapshot || branch.isCurrent || branchBusy || isSyncing) {
        return;
      }
      if (!snapshot.workingTree.isClean) {
        reportError({
          kind: "worktreeDirty",
          message: `工作区还有 ${worktreeChangeCount(snapshot)} 项未提交修改，已阻止切换到 ${branch.name}。请先提交、暂存或丢弃这些修改。`,
        });
        return;
      }

      setBranchBusy(true);
      try {
        const next = await checkoutBranch(snapshot.path, branch.name);
        adopt(next);
        setSelected(null);
        setSelectedCommitOid(null);
        setScope("worktree");
        setHistoryRefreshToken((token) => token + 1);
        refreshRefs();
        setNotice({
          tone: "success",
          title: "已切换分支",
          message: `当前分支：${branch.name}`,
        });
      } catch (rawError) {
        reportError(rawError);
      } finally {
        setBranchBusy(false);
      }
    },
    [adopt, branchBusy, isSyncing, refreshRefs, reportError, snapshot],
  );

  const handleDeleteBranch = useCallback(async () => {
    if (!snapshot || !branchDeleteTarget || branchBusy) {
      return;
    }
    setBranchBusy(true);
    try {
      await deleteBranch(
        snapshot.path,
        branchDeleteTarget.name,
        !branchDeleteTarget.isMerged,
      );
      setBranchDeleteTarget(null);
      setHistoryRefreshToken((token) => token + 1);
      refreshRefs();
      setNotice({
        tone: "success",
        title: "分支已删除",
        message: branchDeleteTarget.name,
      });
    } catch (rawError) {
      reportError(rawError);
    } finally {
      setBranchBusy(false);
    }
  }, [branchBusy, branchDeleteTarget, refreshRefs, reportError, snapshot]);

  const handleRestoreRemoteBranch = useCallback(
    async (remote: string, branch: string) => {
      if (
        !snapshot ||
        branchBusy ||
        isMutating ||
        isOpening ||
        isSyncing
      ) {
        return;
      }
      setBranchBusy(true);
      try {
        const next = await restoreRemoteBranch(
          snapshot.path,
          remote,
          branch,
        );
        adopt(next);
        setRemoteBranchesOpen(false);
        setSelected(null);
        setSelectedCommitOid(null);
        setScope("worktree");
        setHistoryRefreshToken((token) => token + 1);
        refreshRefs();
        setNotice({
          tone: "success",
          title: "已从远程恢复分支",
          message: `${remote}/${branch} → ${next.head.branch ?? branch}`,
        });
      } catch (rawError) {
        reportError(rawError);
      } finally {
        setBranchBusy(false);
      }
    },
    [
      adopt,
      branchBusy,
      isMutating,
      isOpening,
      isSyncing,
      refreshRefs,
      reportError,
      snapshot,
    ],
  );

  const handleRenameBranch = useCallback(
    async (newName: string): Promise<boolean> => {
      if (!snapshot || !branchRenameTarget || branchBusy) {
        return false;
      }
      setBranchBusy(true);
      try {
        const result = await renameBranch(
          snapshot.path,
          branchRenameTarget.name,
          newName,
        );
        setBranchRenameTarget(null);
        setSelected(null);
        setSelectedCommitOid(null);
        setScope("worktree");
        setHistoryRefreshToken((token) => token + 1);
        refreshRefs();
        await refresh();
        setNotice({
          tone: "success",
          title: "分支已重命名",
          message: result.needsUpstreamNote
            ? `${result.oldName} → ${result.newName}。远程跟踪未变，如需更新远程分支请手动 push 或调整 upstream。`
            : `${result.oldName} → ${result.newName}。`,
        });
        return true;
      } catch (rawError) {
        reportError(rawError);
        return false;
      } finally {
        setBranchBusy(false);
      }
    },
    [
      branchBusy,
      branchRenameTarget,
      refresh,
      refreshRefs,
      reportError,
      snapshot,
    ],
  );

  const handleMergeBranch = useCallback(async (): Promise<boolean> => {
    if (!snapshot || !mergeTarget || branchBusy) {
      return false;
    }
    setBranchBusy(true);
    try {
      const result = await mergeBranch(snapshot.path, mergeTarget.name);
      adopt(result.snapshot);
      setSelected(null);
      setSelectedCommitOid(null);
      setScope("worktree");
      setHistoryRefreshToken((token) => token + 1);
      refreshRefs();
      setMergeTarget(null);
      if (result.outcome === "conflict") {
        setNotice({
          tone: "warning",
          title: "合并产生冲突",
          message: `${result.conflicts.length} 个冲突文件；请在工作区使用合并工具或标记已解决。`,
        });
      } else {
        setNotice({
          tone: "success",
          title: "分支已合并",
          message: `${result.sourceBranch} 已合并到当前分支；未执行 push。`,
        });
      }
      return true;
    } catch (rawError) {
      reportError(rawError);
      return false;
    } finally {
      setBranchBusy(false);
    }
  }, [
    adopt,
    branchBusy,
    mergeTarget,
    refreshRefs,
    reportError,
    snapshot,
  ]);

  const handleRevertCommit = useCallback(async (): Promise<boolean> => {
    if (!snapshot || !revertTarget || revertBusy) return false;
    setRevertBusy(true);
    try {
      const result = await revertCommit(snapshot.path, revertTarget);
      adopt(result.snapshot);
      setSelected(null);
      setSelectedCommitOid(null);
      setScope("worktree");
      setHistoryRefreshToken((token) => token + 1);
      refreshRefs();
      setRevertTarget(null);
      if (result.outcome === "success") {
        setNotice({
          tone: "success",
          title: "Revert 完成",
          message: "已创建反向提交；未执行 push。",
        });
      } else if (result.outcome === "conflict") {
        setNotice({
          tone: "warning",
          title: "revert 进行中",
          message: `${result.conflicts.length} 个冲突文件；解决后 continue，或中止 revert。`,
        });
      } else if (result.outcome === "otherError") {
        reportError({ kind: "commandFailed", message: result.message });
      } else {
        setNotice({
          tone: "warning",
          title: "revert 进行中",
          message: result.message,
        });
      }
      return true;
    } catch (rawError) {
      reportError(rawError);
      return false;
    } finally {
      setRevertBusy(false);
    }
  }, [adopt, refreshRefs, reportError, revertBusy, revertTarget, snapshot]);

  const handleRevertContinue = useCallback(async () => {
    if (!snapshot || revertBusy) return;
    setRevertBusy(true);
    try {
      const result = await revertContinue(snapshot.path);
      adopt(result.snapshot);
      setHistoryRefreshToken((token) => token + 1);
      refreshRefs();
      if (result.outcome === "success") {
        setNotice({
          tone: "success",
          title: "Revert 已继续并完成",
          message: "反向提交已完成。",
        });
      } else if (result.outcome === "conflict") {
        setNotice({
          tone: "warning",
          title: "revert 仍有冲突",
          message: `${result.conflicts.length} 个冲突文件；解决后再次 continue。`,
        });
      } else if (result.outcome === "otherError") {
        reportError({ kind: "commandFailed", message: result.message });
      }
    } catch (rawError) {
      reportError(rawError);
    } finally {
      setRevertBusy(false);
    }
  }, [adopt, refreshRefs, reportError, revertBusy, snapshot]);

  const handleRevertAbort = useCallback(async () => {
    if (!snapshot || revertBusy) return;
    setRevertBusy(true);
    try {
      const result = await revertAbort(snapshot.path);
      adopt(result.snapshot);
      setSelected(null);
      setSelectedCommitOid(null);
      setHistoryRefreshToken((token) => token + 1);
      refreshRefs();
      setNotice({
        tone: "info",
        title: "Revert 已中止",
        message: "revert 冲突状态已清理。",
      });
    } catch (rawError) {
      reportError(rawError);
    } finally {
      setRevertBusy(false);
    }
  }, [adopt, refreshRefs, reportError, revertBusy, snapshot]);

  const handleRemotesSaved = useCallback(
    (_next: RemoteInfo[]) => {
      refreshRefs();
      setNotice({
        tone: "success",
        title: "远程地址已保存",
        message: "下一次 fetch/pull/push 将使用新的地址。",
      });
    },
    [refreshRefs],
  );

  const runSync = useCallback(
    async (action: SyncAction) => {
      if (!snapshot || syncAction || isMutating || branchBusy) {
        return;
      }
      setSyncAction(action);
      try {
        const result =
          action === "fetch"
            ? await fetchRemote(snapshot.path)
            : action === "pull"
              ? await pullCurrentBranch(snapshot.path)
              : await pushCurrentBranch(snapshot.path);

        adopt(result.snapshot);
        refreshRefs();
        setHistoryRefreshToken((token) => token + 1);
        if (action === "pull") {
          setSelected(null);
          setSelectedCommitOid(null);
          setScope("worktree");
        }

        if (result.outcome === "conflict") {
          setNotice({
            tone: "warning",
            title: "Pull 产生冲突",
            message: `${result.conflicts} 个文件需要解决。请在右侧冲突分组打开外部合并工具，或解决后标记已解决。`,
          });
        } else {
          setNotice({
            tone: "success",
            title:
              action === "fetch"
                ? "Fetch 完成"
                : action === "pull"
                  ? "Pull 完成"
                  : "Push 完成",
            message:
              action === "fetch"
                ? "远程跟踪分支已更新，工作区未改变。"
                : action === "pull"
                  ? "当前分支已更新。"
                  : `已推送 ${result.branch ?? "当前分支"} 到 ${result.remote}。`,
          });
        }
      } catch (rawError) {
        reportError(rawError);
      } finally {
        setSyncAction(null);
      }
    },
    [adopt, branchBusy, isMutating, refreshRefs, reportError, snapshot, syncAction],
  );

  const handleOpenMergeTool = useCallback(
    (file: StatusFile) => {
      if (!snapshot) return;
      void runWorktreeAction(
        file,
        () => openMergeTool(snapshot.path, file.path),
        {
          tone: "info",
          title: "合并工具已关闭",
          message: "请检查冲突是否已解决；如仍有冲突，可再次打开工具或标记已解决。",
        },
      );
    },
    [runWorktreeAction, snapshot],
  );

  const handleMarkResolved = useCallback(
    (file: StatusFile) => {
      if (!snapshot) return;
      void runWorktreeAction(
        file,
        () => markConflictResolved(snapshot.path, file.path),
        {
          tone: "success",
          title: "冲突已标记为解决",
          message: file.path,
        },
      );
    },
    [runWorktreeAction, snapshot],
  );

  useEffect(() => {
    if (!snapshot || !selected) {
      return;
    }
    const stillPresent = [
      ...snapshot.files.staged,
      ...snapshot.files.unstaged,
      ...snapshot.files.untracked,
      ...snapshot.files.conflicted,
    ].some((file) => file.path === selected.file.path);
    if (!stillPresent) {
      setSelected(null);
    }
  }, [selected, snapshot]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDragging(true);
        } else if (event.payload.type === "leave") {
          setIsDragging(false);
        } else if (event.payload.type === "drop") {
          setIsDragging(false);
          const path = event.payload.paths[0];
          if (path) {
            void openRepositoryPath(path);
          }
        }
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch((rawError: unknown) => {
        console.error("无法注册拖拽事件", rawError);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openRepositoryPath]);

  const activeError = error ?? ui.error;
  const dismissActiveError = () => {
    dismissError();
    ui.dismissError();
  };

  const closeRepository = useCallback(() => {
    clear();
    activeRepoPathRef.current = null;
    setActiveRepoPath(null);
    resetRepositoryState();
  }, [clear, resetRepositoryState]);

  const handleRemoveRepository = useCallback(
    async (path: string) => {
      if (isBusy) {
        return;
      }
      const key = path.toLocaleLowerCase();
      const isActive =
        key ===
        (activeRepoPath ?? snapshot?.path ?? "").toLocaleLowerCase();
      if (!isActive) {
        ui.removeRepository(path);
        return;
      }

      const remaining = ui.repos.filter(
        (repo) => repo.path.toLocaleLowerCase() !== key,
      );
      if (remaining.length === 0) {
        closeRepository();
        ui.removeRepository(path);
        return;
      }

      const next = await openRepositoryPath(remaining[0].path);
      if (next) {
        ui.removeRepository(path);
      }
    },
    [
      activeRepoPath,
      closeRepository,
      isBusy,
      openRepositoryPath,
      snapshot?.path,
      ui.removeRepository,
      ui.repos,
    ],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <TitleBar
        repositoryName={snapshot?.name ?? null}
        theme={ui.theme}
        onToggleTheme={() =>
          ui.setTheme(ui.theme === "dark" ? "light" : "dark")
        }
        onOpenAppearance={() => setAppearanceOpen(true)}
      />
      <div className="relative h-full min-h-0 pt-8">
        {isRestoring ? (
          <BootScreen />
        ) : snapshot ? (
          <div className="grid h-full min-h-0 grid-cols-[256px_300px_minmax(0,1fr)] overflow-hidden min-[1180px]:grid-cols-[280px_340px_minmax(0,1fr)]">
            <WorkspaceSidebar
              snapshot={snapshot}
              repos={ui.repos}
              activeRepoPath={activeRepoPath}
              branches={branches}
              remotes={remotes}
              refsLoading={refsLoading}
              refsError={refsError}
              isBusy={isBusy}
              branchBusy={branchBusy || isSyncing || isMutating || isOpening}
              isSyncing={isSyncing}
              syncAction={syncAction}
              onOpen={() => void chooseRepository()}
              onClone={() => setCloneOpen(true)}
              onInit={() => setInitOpen(true)}
              onSettings={() => setSettingsOpen(true)}
              onSelectRepo={(path) => void openRepositoryPath(path)}
              onRemoveRepo={(path) => void handleRemoveRepository(path)}
              onReloadRefs={reloadRefs}
              onCreateBranch={() => setBranchCreateOpen(true)}
              onRestoreRemote={() => setRemoteBranchesOpen(true)}
              onRenameBranch={setBranchRenameTarget}
              onMergeBranch={setMergeTarget}
              onManageTags={() => setTagsOpen(true)}
              onCheckoutBranch={(branch) => void handleCheckout(branch)}
              onDeleteBranch={(branch) => setBranchDeleteTarget(branch)}
              onManageRemotes={() => setRemoteOpen(true)}
              onFetch={() => void runSync("fetch")}
              onPull={() => void runSync("pull")}
              onPush={() => setPushOpen(true)}
              onReflog={() => setReflogOpen(true)}
            />
            <CommitHistory
              key={snapshot.path}
              repoPath={snapshot.path}
              refreshToken={historyRefreshToken}
              totalCommits={snapshot.commitCount}
              selectedOid={selectedCommitOid}
              onSelectCommit={handleSelectCommit}
            />
            <DetailsPanel
              snapshot={snapshot}
              selected={selected}
              selectedCommitOid={selectedCommitOid}
              scope={scope}
              isRefreshing={isRefreshing}
              isMutating={isMutating}
              isOpening={isOpening}
              actionPath={actionPath}
              indexRevision={indexRevision}
              onRefresh={() => void refreshAll()}
              onStageAll={() => void stageAll()}
              onStageHunks={handleStageHunks}
              onUnstageHunks={handleUnstageHunks}
              onOpenFileHistory={setFileHistoryPath}
              onOpenBlame={setBlamePath}
              onDiscardLines={handleDiscardLines}
              onStashError={reportError}
              onSelectFile={handleSelectFile}
              onScopeChange={setScope}
              onClearSelection={() => setSelected(null)}
              onClearCommit={() => setSelectedCommitOid(null)}
              onStage={handleStage}
              onUnstage={handleUnstage}
              onDiscard={handleDiscardRequest}
              onOpenCommit={() => setCommitOpen(true)}
              onOpenAmend={() => setAmendOpen(true)}
              onOpenMergeTool={handleOpenMergeTool}
              onMarkResolved={handleMarkResolved}
              onRevertCommit={(oid) => setRevertTarget(oid)}
              revertInProgress={snapshot.revertInProgress}
              revertConflicts={snapshot.files.conflicted.length}
              revertBusy={revertBusy}
              onContinueRevert={() => void handleRevertContinue()}
              onAbortRevert={() => void handleRevertAbort()}
            />
          </div>
        ) : (
          <WelcomeScreen
            repos={ui.repos}
            isBusy={isBusy}
            onOpen={() => void chooseRepository()}
            onClone={() => setCloneOpen(true)}
            onInit={() => setInitOpen(true)}
            onSelectRepo={(path) => void openRepositoryPath(path)}
            onRemoveRepo={(path) => void handleRemoveRepository(path)}
          />
        )}
      </div>

      {isDragging && <DragOverlay />}

      <CloneRepositoryDialog
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        onCloned={handleCloned}
      />

      <InitRepositoryDialog
        open={initOpen}
        onOpenChange={setInitOpen}
        onInitialized={handleInitialized}
      />

      {snapshot && (
        <>
          <RepositorySettingsDialog
            key={snapshot.path}
            open={settingsOpen}
            repoPath={snapshot.path}
            repoName={snapshot.name}
            onOpenChange={setSettingsOpen}
          />
          <CommitDialog
            open={commitOpen}
            snapshot={snapshot}
            onOpenChange={setCommitOpen}
            onCommitted={handleCommitted}
            onCommitAndPush={handleCommitAndPush}
          />
          <AmendCommitDialog
            open={amendOpen}
            snapshot={snapshot}
            onOpenChange={setAmendOpen}
            onConfirm={handleAmend}
          />
          <FileHistoryDialog
            open={Boolean(fileHistoryPath)}
            repoPath={snapshot.path}
            filePath={fileHistoryPath}
            onOpenChange={(open) => {
              if (!open) setFileHistoryPath(null);
            }}
            onOpenCommit={(oid) => {
              setFileHistoryPath(null);
              setSelected(null);
              setSelectedCommitOid(oid);
            }}
          />
          <BlameDialog
            open={Boolean(blamePath)}
            repoPath={snapshot.path}
            filePath={blamePath}
            onOpenChange={(open) => {
              if (!open) setBlamePath(null);
            }}
            onOpenCommit={(oid) => {
              setBlamePath(null);
              setSelected(null);
              setSelectedCommitOid(oid);
            }}
          />
          <TagDialog
            open={tagsOpen}
            repoPath={snapshot.path}
            headOid={snapshot.head.oid}
            onOpenChange={setTagsOpen}
          />
          <RevertConfirmDialog
            sha={revertTarget}
            onOpenChange={(open) => {
              if (!open) setRevertTarget(null);
            }}
            onConfirm={handleRevertCommit}
          />
          <BranchCreateDialog
            open={branchCreateOpen}
            repoPath={snapshot.path}
            defaultStartPoint={selectedCommitOid}
            onOpenChange={setBranchCreateOpen}
            onCreated={() => {
              setHistoryRefreshToken((token) => token + 1);
              refreshRefs();
              setNotice({
                tone: "success",
                title: "分支已创建",
                message: "分支列表已刷新，当前分支未改变。",
              });
            }}
          />
          <BranchDeleteDialog
            branch={branchDeleteTarget}
            isBusy={branchBusy}
            onOpenChange={(open) => {
              if (!open) setBranchDeleteTarget(null);
            }}
            onConfirm={() => void handleDeleteBranch()}
          />
          <BranchRenameDialog
            branch={branchRenameTarget}
            onOpenChange={(open) => {
              if (!open) setBranchRenameTarget(null);
            }}
            onConfirm={handleRenameBranch}
          />
          <MergeBranchDialog
            branch={mergeTarget}
            currentBranch={snapshot.head.branch}
            onOpenChange={(open) => {
              if (!open) setMergeTarget(null);
            }}
            onConfirm={handleMergeBranch}
          />
          <RemoteBranchDialog
            open={remoteBranchesOpen}
            repoPath={snapshot.path}
            localBranches={branches}
            isBusy={branchBusy || isMutating || isOpening || isSyncing}
            onOpenChange={setRemoteBranchesOpen}
            onRestore={(remote, branch) =>
              void handleRestoreRemoteBranch(remote, branch)
            }
          />
          <RemoteDialog
            open={remoteOpen}
            repoPath={snapshot.path}
            remotes={remotes}
            isLoading={refsLoading}
            refsError={refsError}
            onOpenChange={setRemoteOpen}
            onSaved={handleRemotesSaved}
          />
          <PushConfirmDialog
            open={pushOpen}
            snapshot={snapshot}
            isPushing={syncAction === "push"}
            onOpenChange={setPushOpen}
            onConfirm={() => {
              setPushOpen(false);
              void runSync("push");
            }}
          />
          <ReflogDialog
            open={reflogOpen}
            repoPath={snapshot.path}
            onOpenChange={setReflogOpen}
          />
        </>
      )}

      <DiscardDialog
        file={discardTarget}
        isBusy={isDiscarding}
        onOpenChange={(open) => {
          if (!open) {
            setDiscardTarget(null);
          }
        }}
        onConfirm={() => void confirmDiscard()}
      />

      <AppearanceSettingsDialog
        open={appearanceOpen}
        theme={ui.theme}
        fontScale={ui.fontScale}
        onOpenChange={setAppearanceOpen}
        onThemeChange={ui.setTheme}
        onFontScaleChange={ui.setFontScale}
      />

      {(notice || activeError) && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(390px,calc(100vw-2.5rem))] flex-col gap-2">
          {notice && (
            <div className="pointer-events-auto">
              <NoticeToast notice={notice} onDismiss={() => setNotice(null)} />
            </div>
          )}
          {activeError && (
            <div className="pointer-events-auto">
              <ErrorBanner
                error={activeError}
                onDismiss={dismissActiveError}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
