import { invoke } from "@tauri-apps/api/core";

import type {
  BlameLineMeta,
  BranchInfo,
  CommitDetail,
  CommitPage,
  CommitPushResult,
  CommitResult,
  DiffScope,
  FileDiff,
  GitError,
  GitErrorKind,
  MergeResult,
  ReflogEntry,
  RepositoryConfig,
  RepositorySnapshot,
  RemoteBranchInfo,
  RemoteInfo,
  RenameBranchResult,
  RevertResult,
  StashEntry,
  SyncResult,
  TagEntry,
} from "@/types/git";

const GIT_ERROR_KINDS: readonly GitErrorKind[] = [
  "gitNotFound",
  "notRepository",
  "invalidPath",
  "invalidInput",
  "worktreeDirty",
  "commandFailed",
  "timeout",
  "invalidOutput",
  "io",
];

export function openRepository(path: string): Promise<RepositorySnapshot> {
  return invoke<RepositorySnapshot>("open_repository", { path });
}

export function initRepository(
  path: string,
  initialBranch: string | null,
): Promise<void> {
  return invoke<void>("init_repository", { path, initialBranch });
}

export function cloneRepository(
  url: string,
  targetPath: string,
): Promise<RepositorySnapshot> {
  return invoke<RepositorySnapshot>("clone_repository", { url, targetPath });
}

export function getRepositoryConfig(
  repoPath: string,
): Promise<RepositoryConfig> {
  return invoke<RepositoryConfig>("get_repository_config", { repoPath });
}

export function saveRepositoryIdentity(
  repoPath: string,
  name: string,
  email: string,
): Promise<RepositoryConfig> {
  return invoke<RepositoryConfig>("save_repository_identity", {
    repoPath,
    name,
    email,
  });
}

export function getFileDiff(
  repoPath: string,
  path: string,
  originalPath: string | null,
  scope: DiffScope,
): Promise<FileDiff> {
  return invoke<FileDiff>("get_file_diff", {
    repoPath,
    path,
    originalPath,
    scope,
  });
}

export function listCommits(
  repoPath: string,
  offset: number,
  limit: number,
): Promise<CommitPage> {
  return invoke<CommitPage>("list_commits", { repoPath, offset, limit });
}

export function searchCommits(
  repoPath: string,
  pattern: string,
  page: number,
  pageSize: number,
): Promise<CommitPage> {
  return invoke<CommitPage>("search_commits", {
    repoPath,
    pattern,
    page,
    pageSize,
  });
}

export function fileHistory(
  repoPath: string,
  filePath: string,
  page: number,
  pageSize: number,
): Promise<CommitPage> {
  return invoke<CommitPage>("file_history", {
    repoPath,
    filePath,
    page,
    pageSize,
  });
}

export function blameFile(
  repoPath: string,
  filePath: string,
): Promise<BlameLineMeta[]> {
  return invoke<BlameLineMeta[]>("blame_file", { repoPath, filePath });
}

export function readFileLines(
  repoPath: string,
  filePath: string,
): Promise<string[]> {
  return invoke<string[]>("read_file_lines", { repoPath, filePath });
}

export function listTags(repoPath: string): Promise<TagEntry[]> {
  return invoke<TagEntry[]>("list_tags", { repoPath });
}

export function createTag(
  repoPath: string,
  name: string,
  targetSha: string,
  annotated: boolean,
  message: string | null,
): Promise<TagEntry[]> {
  return invoke<TagEntry[]>("create_tag", {
    repoPath,
    name,
    targetSha,
    annotated,
    message,
  });
}

export function deleteTag(
  repoPath: string,
  name: string,
): Promise<TagEntry[]> {
  return invoke<TagEntry[]>("delete_tag", { repoPath, name });
}

export function revertCommit(
  repoPath: string,
  sha: string,
): Promise<RevertResult> {
  return invoke<RevertResult>("revert_commit", { repoPath, sha });
}

export function revertContinue(repoPath: string): Promise<RevertResult> {
  return invoke<RevertResult>("revert_continue", { repoPath });
}

export function revertAbort(repoPath: string): Promise<RevertResult> {
  return invoke<RevertResult>("revert_abort", { repoPath });
}

export function stageFile(
  repoPath: string,
  path: string,
): Promise<RepositorySnapshot> {
  return invoke<RepositorySnapshot>("stage_file", { repoPath, path });
}

export function stageHunk(
  repoPath: string,
  filePath: string,
  hunkPatch: string,
): Promise<void> {
  return invoke<void>("stage_hunk", { repoPath, filePath, hunkPatch });
}

export function unstageHunk(
  repoPath: string,
  filePath: string,
  hunkPatch: string,
): Promise<void> {
  return invoke<void>("unstage_hunk", { repoPath, filePath, hunkPatch });
}

export function discardLines(
  repoPath: string,
  filePath: string,
  reversePatch: string,
): Promise<void> {
  return invoke<void>("discard_lines", { repoPath, filePath, reversePatch });
}

export function unstageFile(
  repoPath: string,
  path: string,
  originalPath: string | null,
): Promise<RepositorySnapshot> {
  return invoke<RepositorySnapshot>("unstage_file", {
    repoPath,
    path,
    originalPath,
  });
}

export function discardFile(
  repoPath: string,
  path: string,
  originalPath: string | null,
): Promise<RepositorySnapshot> {
  return invoke<RepositorySnapshot>("discard_file", {
    repoPath,
    path,
    originalPath,
  });
}

export function getStagedDiffs(repoPath: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>("get_staged_diffs", { repoPath });
}

export interface CommitAuthor {
  name: string;
  email: string;
}

export function commitStaged(
  repoPath: string,
  title: string,
  body: string,
  author?: CommitAuthor | null,
  noVerify = false,
): Promise<CommitResult> {
  if (author) {
    return invoke<CommitResult>("commit_staged_with_author", {
      repoPath,
      title,
      body: body.trim() ? body : null,
      authorName: author.name,
      authorEmail: author.email,
      noVerify,
    });
  }
  return invoke<CommitResult>("commit_staged", {
    repoPath,
    title,
    body: body.trim() ? body : null,
    noVerify,
  });
}

export function commitAndPush(
  repoPath: string,
  title: string,
  body: string,
  author?: CommitAuthor | null,
  noVerify = false,
): Promise<CommitPushResult> {
  if (author) {
    return invoke<CommitPushResult>("commit_and_push_with_author", {
      repoPath,
      title,
      body: body.trim() ? body : null,
      authorName: author.name,
      authorEmail: author.email,
      noVerify,
    });
  }
  return invoke<CommitPushResult>("commit_and_push", {
    repoPath,
    title,
    body: body.trim() ? body : null,
    noVerify,
  });
}

export function amendCommit(
  repoPath: string,
  message: string | null,
  includeStaged: boolean,
): Promise<void> {
  return invoke<void>("amend_commit", {
    repoPath,
    message,
    includeStaged,
  });
}

export function getCommitDetail(
  repoPath: string,
  oid: string,
): Promise<CommitDetail> {
  return invoke<CommitDetail>("get_commit_detail", { repoPath, oid });
}

export function getCommitFileDiff(
  repoPath: string,
  oid: string,
  path: string,
  originalPath: string | null,
): Promise<FileDiff> {
  return invoke<FileDiff>("get_commit_file_diff", {
    repoPath,
    oid,
    path,
    originalPath,
  });
}

export function listBranches(repoPath: string): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>("list_branches", { repoPath });
}

export function createBranch(
  repoPath: string,
  name: string,
  startPoint: string | null,
): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>("create_branch", {
    repoPath,
    name,
    startPoint,
  });
}

export function checkoutBranch(
  repoPath: string,
  name: string,
): Promise<RepositorySnapshot> {
  return invoke<RepositorySnapshot>("checkout_branch", { repoPath, name });
}

export function deleteBranch(
  repoPath: string,
  name: string,
  force: boolean,
): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>("delete_branch", { repoPath, name, force });
}

export function mergeBranch(
  repoPath: string,
  sourceBranch: string,
): Promise<MergeResult> {
  return invoke<MergeResult>("merge_branch", {
    repoPath,
    sourceBranch,
  });
}

export function renameBranch(
  repoPath: string,
  oldName: string,
  newName: string,
): Promise<RenameBranchResult> {
  return invoke<RenameBranchResult>("rename_branch", {
    repoPath,
    oldName,
    newName,
  });
}

export function listRemotes(repoPath: string): Promise<RemoteInfo[]> {
  return invoke<RemoteInfo[]>("list_remotes", { repoPath });
}

export function listRemoteBranches(
  repoPath: string,
): Promise<RemoteBranchInfo[]> {
  return invoke<RemoteBranchInfo[]>("list_remote_branches", { repoPath });
}

export function restoreRemoteBranch(
  repoPath: string,
  remote: string,
  branch: string,
): Promise<RepositorySnapshot> {
  return invoke<RepositorySnapshot>("restore_remote_branch", {
    repoPath,
    remote,
    branch,
  });
}

export function setRemote(
  repoPath: string,
  name: string,
  url: string,
): Promise<RemoteInfo[]> {
  return invoke<RemoteInfo[]>("set_remote", { repoPath, name, url });
}

export function addRemote(
  repoPath: string,
  name: string,
  url: string,
): Promise<RemoteInfo[]> {
  return invoke<RemoteInfo[]>("add_remote", { repoPath, name, url });
}

export function setRemoteUrl(
  repoPath: string,
  name: string,
  url: string,
): Promise<RemoteInfo[]> {
  return invoke<RemoteInfo[]>("set_remote_url", { repoPath, name, url });
}

export function fetchRemote(repoPath: string): Promise<SyncResult> {
  return invoke<SyncResult>("fetch_remote", { repoPath });
}

export function pullCurrentBranch(repoPath: string): Promise<SyncResult> {
  return invoke<SyncResult>("pull_current_branch", { repoPath });
}

export function pushCurrentBranch(repoPath: string): Promise<SyncResult> {
  return invoke<SyncResult>("push_current_branch", { repoPath });
}

export function openMergeTool(
  repoPath: string,
  path: string,
): Promise<RepositorySnapshot> {
  return invoke<RepositorySnapshot>("open_merge_tool", { repoPath, path });
}

export function markConflictResolved(
  repoPath: string,
  path: string,
): Promise<RepositorySnapshot> {
  return invoke<RepositorySnapshot>("mark_conflict_resolved", {
    repoPath,
    path,
  });
}

export function listReflog(
  repoPath: string,
  limit = 100,
): Promise<ReflogEntry[]> {
  return invoke<ReflogEntry[]>("list_reflog", { repoPath, limit });
}

export function stashPush(
  repoPath: string,
  message: string | null,
  includeUntracked: boolean,
): Promise<void> {
  return invoke<void>("stash_push", {
    repoPath,
    message,
    includeUntracked,
  });
}

export function stashList(repoPath: string): Promise<StashEntry[]> {
  return invoke<StashEntry[]>("stash_list", { repoPath });
}

export function stashApply(
  repoPath: string,
  index: number,
  restoreIndex: boolean,
): Promise<void> {
  return invoke<void>("stash_apply", { repoPath, index, restoreIndex });
}

export function stashPop(
  repoPath: string,
  index: number,
  restoreIndex: boolean,
): Promise<void> {
  return invoke<void>("stash_pop", { repoPath, index, restoreIndex });
}

export function stashDrop(repoPath: string, index: number): Promise<void> {
  return invoke<void>("stash_drop", { repoPath, index });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toGitError(error: unknown): GitError {
  if (
    isRecord(error) &&
    typeof error.kind === "string" &&
    GIT_ERROR_KINDS.includes(error.kind as GitErrorKind) &&
    typeof error.message === "string"
  ) {
    return {
      kind: error.kind as GitErrorKind,
      message: error.message,
    };
  }

  if (typeof error === "string" && error.trim()) {
    return { kind: "io", message: error };
  }

  return {
    kind: "io",
    message: "发生未知错误，请重试。",
  };
}
