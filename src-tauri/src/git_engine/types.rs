use serde::{Deserialize, Serialize};

/// Everything the UI needs to paint the repository shell.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    pub path: String,
    pub name: String,
    pub head: HeadState,
    pub working_tree: WorkingTreeSummary,
    pub files: WorkingTreeFiles,
    pub commit_count: u64,
    /// True while a `git revert` conflict is waiting for continue/abort.
    pub revert_in_progress: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HeadState {
    /// `None` when HEAD is detached.
    pub branch: Option<String>,
    pub detached: bool,
    /// `None` for a repository without any commit yet.
    pub oid: Option<String>,
    pub short_oid: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTreeSummary {
    pub staged: u32,
    pub unstaged: u32,
    pub untracked: u32,
    pub conflicted: u32,
    pub is_clean: bool,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTreeFiles {
    pub staged: Vec<StatusFile>,
    pub unstaged: Vec<StatusFile>,
    pub untracked: Vec<StatusFile>,
    pub conflicted: Vec<StatusFile>,
}

impl WorkingTreeFiles {
    pub(crate) fn summary(&self) -> WorkingTreeSummary {
        WorkingTreeSummary {
            staged: self.staged.len() as u32,
            unstaged: self.unstaged.len() as u32,
            untracked: self.untracked.len() as u32,
            conflicted: self.conflicted.len() as u32,
            is_clean: self.staged.is_empty()
                && self.unstaged.is_empty()
                && self.untracked.is_empty()
                && self.conflicted.is_empty(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StatusFile {
    pub path: String,
    pub original_path: Option<String>,
    pub change: FileChangeKind,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FileChangeKind {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Untracked,
    Conflicted,
    Other,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryConfig {
    pub user_name: Option<ConfigValue>,
    pub user_email: Option<ConfigValue>,
    pub origin_url: Option<String>,
    pub origin_url_redacted: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfigValue {
    pub value: String,
    pub source: ConfigSource,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConfigSource {
    Local,
    Inherited,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiffScope {
    Worktree,
    Staged,
    Head,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub original_path: Option<String>,
    pub lines: Vec<DiffLine>,
    pub is_binary: bool,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub content: String,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiffLineKind {
    Context,
    Addition,
    Deletion,
    Hunk,
    Meta,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub oid: String,
    pub short_oid: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    /// Unix timestamp in seconds.
    pub authored_at: i64,
    pub refs: Vec<CommitRef>,
    pub is_head: bool,
    pub subject: String,
    /// Set only by `file_history` when this commit renames the tracked file.
    pub renamed_from: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitRef {
    pub name: String,
    pub kind: CommitRefKind,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CommitRefKind {
    Branch,
    Remote,
    Tag,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitPage {
    pub commits: Vec<CommitSummary>,
    pub offset: u32,
    pub limit: u32,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub oid: String,
    pub short_oid: String,
    pub subject: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub authored_at: i64,
    pub refs: Vec<CommitRef>,
    pub is_head: bool,
    pub files: Vec<CommitFileChange>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitFileChange {
    pub path: String,
    pub original_path: Option<String>,
    pub change: FileChangeKind,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub oid: String,
    pub short_oid: String,
    pub snapshot: RepositorySnapshot,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub outcome: MergeOutcome,
    pub source_branch: String,
    pub conflicts: Vec<String>,
    pub snapshot: RepositorySnapshot,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MergeOutcome {
    Success,
    Conflict,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitPushResult {
    pub commit_sha: String,
    pub commit_short_sha: String,
    pub push: PushOutcome,
    pub push_message: String,
    pub snapshot: RepositorySnapshot,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PushOutcome {
    Success,
    AuthFailed,
    NonFastForward,
    NetworkError,
    Other,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlameLineMeta {
    pub sha: String,
    pub author: String,
    /// Unix timestamp in seconds.
    pub time: i64,
    pub author_tz: String,
    pub start_line: u32,
    pub line_count: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagEntry {
    pub name: String,
    pub target_sha: String,
    pub annotated: bool,
    pub message: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevertResult {
    pub outcome: RevertOutcome,
    pub conflicts: Vec<String>,
    pub message: String,
    pub snapshot: RepositorySnapshot,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RevertOutcome {
    Success,
    Conflict,
    InProgress,
    OtherError,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub oid: String,
    pub short_oid: String,
    pub is_current: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_merged: bool,
    pub last_subject: String,
    pub last_committed_at: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub index: u32,
    pub selector: String,
    pub oid: String,
    pub short_oid: String,
    pub message: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RenameBranchResult {
    pub old_name: String,
    pub new_name: String,
    pub needs_upstream_note: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranchInfo {
    pub remote: String,
    pub name: String,
    pub full_name: String,
    pub oid: String,
    pub short_oid: String,
    pub last_subject: String,
    pub last_committed_at: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncAction {
    Fetch,
    Pull,
    Push,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncOutcome {
    Completed,
    Conflict,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub action: SyncAction,
    pub outcome: SyncOutcome,
    pub remote: String,
    pub branch: Option<String>,
    pub conflicts: u32,
    pub snapshot: RepositorySnapshot,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub oid: String,
    pub short_oid: String,
    pub selector: String,
    pub action: String,
    pub timestamp: i64,
    pub author: String,
}
