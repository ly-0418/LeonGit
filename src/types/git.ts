export type GitErrorKind =
  | "gitNotFound"
  | "notRepository"
  | "invalidPath"
  | "invalidInput"
  | "worktreeDirty"
  | "commandFailed"
  | "timeout"
  | "invalidOutput"
  | "io";

export interface GitError {
  kind: GitErrorKind;
  message: string;
}

export interface HeadState {
  branch: string | null;
  detached: boolean;
  oid: string | null;
  shortOid: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface WorkingTreeSummary {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  isClean: boolean;
}

export type FileChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "typeChanged"
  | "untracked"
  | "conflicted"
  | "other";

export interface StatusFile {
  path: string;
  originalPath: string | null;
  change: FileChangeKind;
}

export interface WorkingTreeFiles {
  staged: StatusFile[];
  unstaged: StatusFile[];
  untracked: StatusFile[];
  conflicted: StatusFile[];
}

export interface RepositorySnapshot {
  path: string;
  name: string;
  head: HeadState;
  workingTree: WorkingTreeSummary;
  files: WorkingTreeFiles;
  commitCount: number;
  revertInProgress: boolean;
}

export type ConfigSource = "local" | "inherited";

export interface ConfigValue {
  value: string;
  source: ConfigSource;
}

export interface RepositoryConfig {
  userName: ConfigValue | null;
  userEmail: ConfigValue | null;
  originUrl: string | null;
  originUrlRedacted: boolean;
}

export interface DiffLine {
  kind: "context" | "addition" | "deletion" | "hunk" | "meta";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export type DiffScope = "worktree" | "staged" | "head";

export interface FileDiff {
  path: string;
  originalPath: string | null;
  lines: DiffLine[];
  isBinary: boolean;
  truncated: boolean;
}

export type CommitRefKind = "branch" | "remote" | "tag";

export interface CommitRef {
  name: string;
  kind: CommitRefKind;
}

export interface CommitSummary {
  oid: string;
  shortOid: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authoredAt: number;
  refs: CommitRef[];
  isHead: boolean;
  subject: string;
  renamedFrom: string | null;
}

export interface CommitPage {
  commits: CommitSummary[];
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface CommitFileChange {
  path: string;
  originalPath: string | null;
  change: FileChangeKind;
}

export interface CommitDetail {
  oid: string;
  shortOid: string;
  subject: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredAt: number;
  refs: CommitRef[];
  isHead: boolean;
  files: CommitFileChange[];
}

export interface BlameLineMeta {
  sha: string;
  author: string;
  time: number;
  authorTz: string;
  startLine: number;
  lineCount: number;
}

export interface TagEntry {
  name: string;
  targetSha: string;
  annotated: boolean;
  message: string;
  timestamp: number;
}

export type RevertOutcome =
  | "success"
  | "conflict"
  | "inProgress"
  | "otherError";

export interface RevertResult {
  outcome: RevertOutcome;
  conflicts: string[];
  message: string;
  snapshot: RepositorySnapshot;
}

export interface CommitResult {
  oid: string;
  shortOid: string;
  snapshot: RepositorySnapshot;
}

export type PushOutcome =
  | "success"
  | "authFailed"
  | "nonFastForward"
  | "networkError"
  | "other";

export interface CommitPushResult {
  commitSha: string;
  commitShortSha: string;
  push: PushOutcome;
  pushMessage: string;
  snapshot: RepositorySnapshot;
}

export type MergeOutcome = "success" | "conflict";

export interface MergeResult {
  outcome: MergeOutcome;
  sourceBranch: string;
  conflicts: string[];
  snapshot: RepositorySnapshot;
}

export interface BranchInfo {
  name: string;
  oid: string;
  shortOid: string;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  isMerged: boolean;
  lastSubject: string;
  lastCommittedAt: number;
}

export interface RemoteBranchInfo {
  remote: string;
  name: string;
  fullName: string;
  oid: string;
  shortOid: string;
  lastSubject: string;
  lastCommittedAt: number;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface RenameBranchResult {
  oldName: string;
  newName: string;
  needsUpstreamNote: boolean;
}

export interface StashEntry {
  index: number;
  selector: string;
  oid: string;
  shortOid: string;
  message: string;
  timestamp: number;
}

export type SyncAction = "fetch" | "pull" | "push";
export type SyncOutcome = "completed" | "conflict";

export interface SyncResult {
  action: SyncAction;
  outcome: SyncOutcome;
  remote: string;
  branch: string | null;
  conflicts: number;
  snapshot: RepositorySnapshot;
}

export interface ReflogEntry {
  oid: string;
  shortOid: string;
  selector: string;
  action: string;
  timestamp: number;
  author: string;
}
