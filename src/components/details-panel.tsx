import { CommitDetail } from "@/components/commit-detail";
import { DiffView } from "@/components/diff-view";
import { RevertBanner } from "@/components/revert-banner";
import { WorkingTreeOverview } from "@/components/working-tree-overview";
import type { SelectedFile } from "@/hooks/use-file-diff";
import type { DiffScope, RepositorySnapshot, StatusFile } from "@/types/git";

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
  onOpenMergeTool: (file: StatusFile) => void;
  onMarkResolved: (file: StatusFile) => void;
  onRevertCommit: (oid: string) => void;
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
  onOpenMergeTool,
  onMarkResolved,
  onRevertCommit,
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
            onOpenMergeTool={onOpenMergeTool}
            onMarkResolved={onMarkResolved}
          />
        )}
      </div>
    </section>
  );
}
