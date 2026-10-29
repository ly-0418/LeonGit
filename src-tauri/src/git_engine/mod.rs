mod actions;
mod blame;
mod branches;
mod clone;
mod command;
mod commit_detail;
mod config;
mod diff;
mod error;
mod file_content;
mod hunk;
mod log;
mod merge;
mod proxy;
mod redact;
mod reflog;
mod remotes;
mod repository;
mod revert;
mod stash;
mod status;
mod sync;
mod tags;
mod types;

pub use error::GitError;
pub use types::{
    BlameLineMeta, BranchInfo, CommitDetail, CommitPage, CommitPushResult, CommitResult, DiffScope,
    FileDiff, MergeResult, ReflogEntry, RemoteBranchInfo, RemoteInfo, RenameBranchResult,
    RepositoryConfig, RepositorySnapshot, RevertResult, StashEntry, SyncResult, TagEntry,
};

pub fn open_repository(path: &str) -> Result<RepositorySnapshot, GitError> {
    repository::snapshot(path)
}

pub fn init_repository(path: &str, initial_branch: Option<&str>) -> Result<(), GitError> {
    repository::init(path, initial_branch)
}

pub fn safe_repo_path(path: &str) -> Result<std::path::PathBuf, GitError> {
    repository::resolve_worktree(path)
}

pub fn list_commits(
    worktree: &std::path::Path,
    offset: u32,
    limit: u32,
) -> Result<CommitPage, GitError> {
    log::list(worktree, offset, limit)
}

pub fn search_commits(
    worktree: &std::path::Path,
    pattern: &str,
    page: u32,
    page_size: u32,
) -> Result<CommitPage, GitError> {
    log::search(worktree, pattern, page, page_size)
}

pub fn file_history(
    worktree: &std::path::Path,
    file_path: &str,
    page: u32,
    page_size: u32,
) -> Result<CommitPage, GitError> {
    log::file_history(worktree, file_path, page, page_size)
}

pub fn blame_file(
    worktree: &std::path::Path,
    file_path: &str,
) -> Result<Vec<BlameLineMeta>, GitError> {
    blame::blame_file(worktree, file_path)
}

pub fn read_file_lines(
    worktree: &std::path::Path,
    file_path: &str,
) -> Result<Vec<String>, GitError> {
    file_content::read_lines(worktree, file_path)
}

pub fn list_tags(worktree: &std::path::Path) -> Result<Vec<TagEntry>, GitError> {
    tags::list(worktree)
}

pub fn create_tag(
    worktree: &std::path::Path,
    name: &str,
    target_sha: &str,
    annotated: bool,
    message: Option<&str>,
) -> Result<Vec<TagEntry>, GitError> {
    tags::create(worktree, name, target_sha, annotated, message)
}

pub fn delete_tag(worktree: &std::path::Path, name: &str) -> Result<Vec<TagEntry>, GitError> {
    tags::delete(worktree, name)
}

pub fn revert_commit(worktree: &std::path::Path, sha: &str) -> Result<RevertResult, GitError> {
    revert::revert_commit(worktree, sha)
}

pub fn revert_continue(worktree: &std::path::Path) -> Result<RevertResult, GitError> {
    revert::revert_continue(worktree)
}

pub fn revert_abort(worktree: &std::path::Path) -> Result<RevertResult, GitError> {
    revert::revert_abort(worktree)
}

pub fn clone_repository(url: &str, target: &str) -> Result<RepositorySnapshot, GitError> {
    clone::clone_repository(url, target)
}

pub fn repository_config(worktree: &std::path::Path) -> Result<RepositoryConfig, GitError> {
    config::read(worktree)
}

pub fn save_repository_identity(
    worktree: &std::path::Path,
    name: &str,
    email: &str,
) -> Result<RepositoryConfig, GitError> {
    config::write_identity(worktree, name, email)
}

pub fn file_diff(
    worktree: &std::path::Path,
    path: &str,
    original_path: Option<&str>,
    scope: DiffScope,
) -> Result<FileDiff, GitError> {
    diff::read(worktree, path, original_path, scope)
}

pub fn stage_file(worktree: &std::path::Path, path: &str) -> Result<RepositorySnapshot, GitError> {
    actions::stage_file(worktree, path)
}

pub fn stage_hunk(
    worktree: &std::path::Path,
    file_path: &str,
    hunk_patch: &str,
) -> Result<(), GitError> {
    hunk::stage(worktree, file_path, hunk_patch)
}

pub fn unstage_hunk(
    worktree: &std::path::Path,
    file_path: &str,
    hunk_patch: &str,
) -> Result<(), GitError> {
    hunk::unstage(worktree, file_path, hunk_patch)
}

pub fn discard_lines(
    worktree: &std::path::Path,
    file_path: &str,
    reverse_patch: &str,
) -> Result<(), GitError> {
    hunk::discard_lines(worktree, file_path, reverse_patch)
}

pub fn unstage_file(
    worktree: &std::path::Path,
    path: &str,
    original_path: Option<&str>,
) -> Result<RepositorySnapshot, GitError> {
    actions::unstage_file(worktree, path, original_path)
}

pub fn discard_file(
    worktree: &std::path::Path,
    path: &str,
    original_path: Option<&str>,
) -> Result<RepositorySnapshot, GitError> {
    actions::discard_file(worktree, path, original_path)
}

pub fn staged_diffs(
    worktree: &std::path::Path,
    offset: u32,
    limit: u32,
) -> Result<Vec<FileDiff>, GitError> {
    actions::staged_diffs(worktree, offset, limit)
}

pub fn commit(
    worktree: &std::path::Path,
    title: &str,
    body: Option<&str>,
    no_verify: bool,
) -> Result<CommitResult, GitError> {
    actions::commit(worktree, title, body, no_verify)
}

pub fn amend_commit(
    worktree: &std::path::Path,
    message: Option<&str>,
    include_staged: bool,
) -> Result<(), GitError> {
    actions::amend(worktree, message, include_staged)
}

pub fn commit_and_push(
    worktree: &std::path::Path,
    title: &str,
    body: Option<&str>,
    no_verify: bool,
) -> Result<CommitPushResult, GitError> {
    actions::commit_and_push(worktree, title, body, no_verify)
}

pub fn commit_with_author(
    worktree: &std::path::Path,
    title: &str,
    body: Option<&str>,
    author_name: Option<&str>,
    author_email: Option<&str>,
    no_verify: bool,
) -> Result<CommitResult, GitError> {
    actions::commit_with_author(worktree, title, body, author_name, author_email, no_verify)
}

pub fn commit_and_push_with_author(
    worktree: &std::path::Path,
    title: &str,
    body: Option<&str>,
    author_name: Option<&str>,
    author_email: Option<&str>,
    no_verify: bool,
) -> Result<CommitPushResult, GitError> {
    actions::commit_and_push_with_author(
        worktree,
        title,
        body,
        author_name,
        author_email,
        no_verify,
    )
}

pub fn commit_detail(worktree: &std::path::Path, oid: &str) -> Result<CommitDetail, GitError> {
    commit_detail::read(worktree, oid)
}

pub fn commit_file_diff(
    worktree: &std::path::Path,
    oid: &str,
    path: &str,
    original_path: Option<&str>,
) -> Result<FileDiff, GitError> {
    commit_detail::file_diff(worktree, oid, path, original_path)
}

pub fn branches(worktree: &std::path::Path) -> Result<Vec<BranchInfo>, GitError> {
    branches::list(worktree)
}

pub fn create_branch(
    worktree: &std::path::Path,
    name: &str,
    start_point: Option<&str>,
) -> Result<Vec<BranchInfo>, GitError> {
    branches::create(worktree, name, start_point)
}

pub fn checkout_branch(
    worktree: &std::path::Path,
    name: &str,
) -> Result<RepositorySnapshot, GitError> {
    branches::checkout(worktree, name)
}

pub fn delete_branch(
    worktree: &std::path::Path,
    name: &str,
    force: bool,
) -> Result<Vec<BranchInfo>, GitError> {
    branches::delete(worktree, name, force)
}

pub fn rename_branch(
    worktree: &std::path::Path,
    old_name: &str,
    new_name: &str,
) -> Result<RenameBranchResult, GitError> {
    branches::rename(worktree, old_name, new_name)
}

pub fn remote_branches(worktree: &std::path::Path) -> Result<Vec<RemoteBranchInfo>, GitError> {
    branches::list_remote(worktree)
}

pub fn restore_remote_branch(
    worktree: &std::path::Path,
    remote: &str,
    branch: &str,
) -> Result<RepositorySnapshot, GitError> {
    branches::restore_remote(worktree, remote, branch)
}

pub fn remotes(worktree: &std::path::Path) -> Result<Vec<RemoteInfo>, GitError> {
    remotes::list(worktree)
}

pub fn set_remote(
    worktree: &std::path::Path,
    name: &str,
    url: &str,
) -> Result<Vec<RemoteInfo>, GitError> {
    remotes::set(worktree, name, url)
}

pub fn add_remote(
    worktree: &std::path::Path,
    name: &str,
    url: &str,
) -> Result<Vec<RemoteInfo>, GitError> {
    remotes::add(worktree, name, url)
}

pub fn set_remote_url(
    worktree: &std::path::Path,
    name: &str,
    url: &str,
) -> Result<Vec<RemoteInfo>, GitError> {
    remotes::set_url(worktree, name, url)
}

pub fn fetch(worktree: &std::path::Path) -> Result<SyncResult, GitError> {
    sync::fetch(worktree)
}

pub fn pull(worktree: &std::path::Path) -> Result<SyncResult, GitError> {
    sync::pull(worktree)
}

pub fn push(worktree: &std::path::Path) -> Result<SyncResult, GitError> {
    sync::push(worktree)
}

pub fn open_merge_tool(
    worktree: &std::path::Path,
    path: &str,
) -> Result<RepositorySnapshot, GitError> {
    merge::open_merge_tool(worktree, path)
}

pub fn merge_branch(
    worktree: &std::path::Path,
    source_branch: &str,
) -> Result<MergeResult, GitError> {
    merge::merge_branch(worktree, source_branch)
}

pub fn mark_resolved(
    worktree: &std::path::Path,
    path: &str,
) -> Result<RepositorySnapshot, GitError> {
    merge::mark_resolved(worktree, path)
}

pub fn reflog(worktree: &std::path::Path, limit: u32) -> Result<Vec<ReflogEntry>, GitError> {
    reflog::list(worktree, limit)
}

pub fn stash_push(
    worktree: &std::path::Path,
    message: Option<&str>,
    include_untracked: bool,
) -> Result<(), GitError> {
    stash::push(worktree, message, include_untracked)
}

pub fn stash_list(worktree: &std::path::Path) -> Result<Vec<StashEntry>, GitError> {
    stash::list(worktree)
}

pub fn stash_apply(
    worktree: &std::path::Path,
    index: usize,
    restore_index: bool,
) -> Result<(), GitError> {
    stash::apply(worktree, index, restore_index)
}

pub fn stash_pop(
    worktree: &std::path::Path,
    index: usize,
    restore_index: bool,
) -> Result<(), GitError> {
    stash::pop(worktree, index, restore_index)
}

pub fn stash_drop(worktree: &std::path::Path, index: usize) -> Result<(), GitError> {
    stash::drop(worktree, index)
}
