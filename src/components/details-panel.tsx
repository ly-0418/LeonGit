import { CommitDetail } from "@/components/commit-detail";
import { DiffView } from "@/components/diff-view";
import { RepoStateBanner } from "@/components/repo-state-banner";
import { RevertBanner } from "@/components/revert-banner";
import { WorkingTreeOverview } from "@/components/working-tree-overview";
import type { SelectedFile } from "@/hooks/use-file-diff";
import type {
  BranchInfo,
  DiffScope,
  RepositorySnapshot,
  StatusFile,
} from "@/types/git";

interface DetailsPanelProps {
  snapshot: RepositorySnapshot;
  selected: SelectedFile | null;
  selectedCommitOid: string | null;
  scope: DiffScope;
  isRefreshing: boolean;
  isMutating: boolean;
  isOpening: boolean;
  actionPath: string | null;
  indexRevision: number;
  onRefresh: () => void;
  onStageAll: () => void;
  onStageHunks: (filePath: string, patch: string) => Promise<boolean>;
  onUnstageHunks: (filePath: string, patch: string) => Promise<boolean>;
  onOpenFileHistory: (filePath: string) => void;
  onOpenBlame: (filePath: string) => void;
  onDiscardLines: (filePath: string, patch: string) => Promise<boolean>;
  onStashError: (error: unknown) => void;
  onSelectFile: (file: StatusFile, scope: DiffScope) => void;
  onScopeChange: (scope: DiffScope) => void;
  onClearSelection: () => void;
  onClearCommit: () => void;
  onStage: (file: StatusFile) => void;
  onUnstage: (file: StatusFile) => void;
  onDiscard: (file: StatusFile) => void;
  onOpenCommit: () => void;
  onOpenAmend: () => void;
  onOpenEmptyCommit: () => void;
  onContinueMerge: () => void;
  onAbortMerge: () => void;
  squashSource: string | null;
  onAbortSquash: () => void;
  shortSha: string | null;
  detachedUnsaved: boolean;
  branches: BranchInfo[];
  onCreateDetachedBranch: () => void;
  onSwitchBranch: (branch: BranchInfo) => void;
  onIgnoreFile: (file: StatusFile, tracked: boolean) => void;
  onOpenMergeTool: (file: StatusFile) => void;
  onMarkResolved: (file: StatusFile) => void;
  onRevertCommit: (oid: string) => void;
  onSoftResetCommit: (oid: string) => void;
  revertInProgress: boolean;
  revertConflicts: number;
  revertBusy: boolean;
  onContinueRevert: () => void;
  onAbortRevert: () => void;
}

export function DetailsPanel({
  snapshot,
  selected,
  selectedCommitOid,
  scope,
  isRefreshing,
  isMutating,
  isOpening,
  actionPath,
  indexRevision,
  onRefresh,
  onStageAll,
  onStageHunks,
  onUnstageHunks,
  onOpenFileHistory,
  onOpenBlame,
  onDiscardLines,
  onStashError,
  onSelectFile,
  onScopeChange,
  onClearSelection,
  onClearCommit,
  onStage,
  onUnstage,
  onDiscard,
  onOpenCommit,
  onOpenAmend,
  onOpenEmptyCommit,
  onContinueMerge,
  onAbortMerge,
  squashSource,
  onAbortSquash,
  shortSha,
  detachedUnsaved,
  branches,
  onCreateDetachedBranch,
  onSwitchBranch,
  onIgnoreFile,
  onOpenMergeTool,
  onMarkResolved,
  onRevertCommit,
  onSoftResetCommit,
  revertInProgress,
  revertConflicts,
  revertBusy,
  onContinueRevert,
  onAbortRevert,
}: DetailsPanelProps) {
  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-app)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_48%_at_85%_0%,rgba(232,182,102,0.04),transparent_65%)]"
      />
      <div className="relative flex h-full min-h-0 flex-col">
        {(snapshot.repoState !== "normal" ||
          snapshot.files.conflicted.length > 0) &&
          snapshot.repoState !== "reverting" && (
            <div className="shrink-0 px-5 pt-4">
              <RepoStateBanner
                state={snapshot.repoState}
                conflicted={snapshot.files.conflicted.length}
                squashSource={squashSource}
                shortSha={shortSha}
                detachedUnsaved={detachedUnsaved}
                branches={branches}
                onContinueMerge={onContinueMerge}
                onAbortMerge={onAbortMerge}
                onAbortSquash={onAbortSquash}
                onCreateDetachedBranch={onCreateDetachedBranch}
                onSwitchBranch={onSwitchBranch}
              />
            </div>
          )}
        {revertInProgress && (
          <RevertBanner
            conflicts={revertConflicts}
            isBusy={revertBusy}
            onContinue={onContinueRevert}
            onAbort={onAbortRevert}
          />
        )}
        {selectedCommitOid ? (
          <CommitDetail
            repoPath={snapshot.path}
            oid={selectedCommitOid}
            onBack={onClearCommit}
            onRevert={onRevertCommit}
            onSoftReset={onSoftResetCommit}
          />
        ) : selected ? (
          <DiffView
            snapshot={snapshot}
            selected={selected}
            scope={scope}
            indexRevision={indexRevision}
            isMutating={isMutating}
            onScopeChange={onScopeChange}
            onStageHunks={onStageHunks}
            onUnstageHunks={onUnstageHunks}
            onOpenFileHistory={onOpenFileHistory}
            onOpenBlame={onOpenBlame}
            onDiscardLines={onDiscardLines}
            onBack={onClearSelection}
          />
        ) : (
          <WorkingTreeOverview
            snapshot={snapshot}
            isRefreshing={isRefreshing}
            isMutating={isMutating}
            isOpening={isOpening}
            actionPath={actionPath}
            onRefresh={onRefresh}
            onStageAll={onStageAll}
            onStashError={onStashError}
            onSelectFile={onSelectFile}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
            onOpenCommit={onOpenCommit}
            onOpenAmend={onOpenAmend}
            onOpenEmptyCommit={onOpenEmptyCommit}
            onIgnore={onIgnoreFile}
            onOpenMergeTool={onOpenMergeTool}
            onMarkResolved={onMarkResolved}
          />
        )}
      </div>
    </section>
  );
}
