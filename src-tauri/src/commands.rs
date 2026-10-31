use tauri::Manager;

use crate::git_engine::{
    self, BranchInfo, CommitDetail, CommitResult, DiffScope, FileDiff, GitError, ReflogEntry,
    RemoteBranchInfo, RemoteInfo, RenameBranchResult, RepositoryConfig, RepositorySnapshot,
    StashEntry, SyncResult,
};
use crate::ui_state::{RepoEntry, RepoEntryInput, UiState};

async fn run_blocking<T, F>(job: F) -> Result<T, GitError>
where
    F: FnOnce() -> Result<T, GitError> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|error| GitError::internal(format!("后台任务异常：{error}")))?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn open_repository(path: String) -> Result<RepositorySnapshot, GitError> {
    run_blocking(move || git_engine::open_repository(&path)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn remote_auth_info(repo_path: String) -> Result<git_engine::RemoteAuthInfo, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::remote_auth_info(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn init_repository(path: String, initial_branch: Option<String>) -> Result<(), GitError> {
    run_blocking(move || git_engine::init_repository(&path, initial_branch.as_deref())).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn clone_repository(
    url: String,
    target_path: String,
) -> Result<RepositorySnapshot, GitError> {
    run_blocking(move || git_engine::clone_repository(&url, &target_path)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_repository_config(repo_path: String) -> Result<RepositoryConfig, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::repository_config(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_repository_identity(
    repo_path: String,
    name: String,
    email: String,
) -> Result<RepositoryConfig, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::save_repository_identity(&worktree, &name, &email)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_file_diff(
    repo_path: String,
    path: String,
    original_path: Option<String>,
    scope: DiffScope,
) -> Result<FileDiff, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::file_diff(&worktree, &path, original_path.as_deref(), scope)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn add_to_gitignore(
    repo_path: String,
    pattern: String,
    target_gitignore: Option<String>,
) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::add_to_gitignore(&worktree, &pattern, target_gitignore.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn check_ignored(repo_path: String, path: String) -> Result<bool, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::check_ignored(&worktree, &path)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_gitignore_files(repo_path: String) -> Result<Vec<String>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::list_gitignore_files(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_file_diff_window(
    repo_path: String,
    path: String,
    original_path: Option<String>,
    scope: DiffScope,
    offset: u32,
    limit: u32,
) -> Result<FileDiff, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::file_diff_window(
            &worktree,
            &path,
            original_path.as_deref(),
            scope,
            offset,
            limit,
        )
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_commits(
    repo_path: String,
    offset: u32,
    limit: u32,
) -> Result<git_engine::CommitPage, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::list_commits(&worktree, offset, limit)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn search_commits(
    repo_path: String,
    pattern: String,
    page: u32,
    page_size: u32,
) -> Result<git_engine::CommitPage, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::search_commits(&worktree, &pattern, page, page_size)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn file_history(
    repo_path: String,
    file_path: String,
    page: u32,
    page_size: u32,
) -> Result<git_engine::CommitPage, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::file_history(&worktree, &file_path, page, page_size)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn blame_file(
    repo_path: String,
    file_path: String,
) -> Result<Vec<git_engine::BlameLineMeta>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::blame_file(&worktree, &file_path)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn read_file_lines(
    repo_path: String,
    file_path: String,
) -> Result<Vec<String>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::read_file_lines(&worktree, &file_path)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_tags(repo_path: String) -> Result<Vec<git_engine::TagEntry>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::list_tags(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_tag(
    repo_path: String,
    name: String,
    target_sha: String,
    annotated: bool,
    message: Option<String>,
) -> Result<Vec<git_engine::TagEntry>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::create_tag(&worktree, &name, &target_sha, annotated, message.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_tag(
    repo_path: String,
    name: String,
) -> Result<Vec<git_engine::TagEntry>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::delete_tag(&worktree, &name)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stage_file(repo_path: String, path: String) -> Result<RepositorySnapshot, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::stage_file(&worktree, &path)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stage_hunk(
    repo_path: String,
    file_path: String,
    hunk_patch: String,
) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::stage_hunk(&worktree, &file_path, &hunk_patch)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn unstage_hunk(
    repo_path: String,
    file_path: String,
    hunk_patch: String,
) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::unstage_hunk(&worktree, &file_path, &hunk_patch)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn discard_lines(
    repo_path: String,
    file_path: String,
    reverse_patch: String,
) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::discard_lines(&worktree, &file_path, &reverse_patch)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn unstage_file(
    repo_path: String,
    path: String,
    original_path: Option<String>,
) -> Result<RepositorySnapshot, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::unstage_file(&worktree, &path, original_path.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn discard_file(
    repo_path: String,
    path: String,
    original_path: Option<String>,
) -> Result<RepositorySnapshot, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::discard_file(&worktree, &path, original_path.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_staged_diffs(
    repo_path: String,
    offset: u32,
    limit: u32,
) -> Result<Vec<FileDiff>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::staged_diffs(&worktree, offset, limit)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit_staged(
    repo_path: String,
    title: String,
    body: Option<String>,
    no_verify: bool,
) -> Result<CommitResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::commit(&worktree, &title, body.as_deref(), no_verify)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit_empty(
    repo_path: String,
    title: String,
    body: Option<String>,
) -> Result<CommitResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::empty_commit(&worktree, &title, body.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit_and_push(
    repo_path: String,
    title: String,
    body: Option<String>,
    no_verify: bool,
) -> Result<git_engine::CommitPushResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::commit_and_push(&worktree, &title, body.as_deref(), no_verify)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit_and_push_with_author(
    repo_path: String,
    title: String,
    body: Option<String>,
    author_name: String,
    author_email: String,
    no_verify: bool,
) -> Result<git_engine::CommitPushResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::commit_and_push_with_author(
            &worktree,
            &title,
            body.as_deref(),
            Some(&author_name),
            Some(&author_email),
            no_verify,
        )
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit_staged_with_author(
    repo_path: String,
    title: String,
    body: Option<String>,
    author_name: String,
    author_email: String,
    no_verify: bool,
) -> Result<git_engine::CommitResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::commit_with_author(
            &worktree,
            &title,
            body.as_deref(),
            Some(&author_name),
            Some(&author_email),
            no_verify,
        )
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reset_soft(repo_path: String, target_sha: String) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::soft_reset(&worktree, &target_sha)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn count_soft_reset(repo_path: String, target_sha: String) -> Result<u32, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::soft_reset_count(&worktree, &target_sha)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn revert_commit(
    repo_path: String,
    sha: String,
) -> Result<git_engine::RevertResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::revert_commit(&worktree, &sha)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn revert_continue(repo_path: String) -> Result<git_engine::RevertResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::revert_continue(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn revert_abort(repo_path: String) -> Result<git_engine::RevertResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::revert_abort(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn amend_commit(
    repo_path: String,
    message: Option<String>,
    include_staged: bool,
) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::amend_commit(&worktree, message.as_deref(), include_staged)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_commit_detail(repo_path: String, oid: String) -> Result<CommitDetail, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::commit_detail(&worktree, &oid)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_commit_file_diff(
    repo_path: String,
    oid: String,
    path: String,
    original_path: Option<String>,
) -> Result<FileDiff, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::commit_file_diff(&worktree, &oid, &path, original_path.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_commit_file_diff_window(
    repo_path: String,
    oid: String,
    path: String,
    original_path: Option<String>,
    offset: u32,
    limit: u32,
) -> Result<FileDiff, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::commit_file_diff_window(
            &worktree,
            &oid,
            &path,
            original_path.as_deref(),
            offset,
            limit,
        )
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_branches(repo_path: String) -> Result<Vec<BranchInfo>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::branches(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_branch(
    repo_path: String,
    name: String,
    start_point: Option<String>,
) -> Result<Vec<BranchInfo>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::create_branch(&worktree, &name, start_point.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn checkout_branch(
    repo_path: String,
    name: String,
) -> Result<RepositorySnapshot, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::checkout_branch(&worktree, &name)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_branch_from_detached(
    repo_path: String,
    branch_name: String,
) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::create_branch_from_detached(&worktree, &branch_name)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_upstream(
    repo_path: String,
    branch: String,
    remote: String,
    remote_branch: String,
) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::set_upstream(&worktree, &branch, &remote, &remote_branch)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_branch(
    repo_path: String,
    name: String,
    force: bool,
) -> Result<Vec<BranchInfo>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::delete_branch(&worktree, &name, force)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
) -> Result<RenameBranchResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::rename_branch(&worktree, &old_name, &new_name)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_remotes(repo_path: String) -> Result<Vec<RemoteInfo>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::remotes(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn add_remote(
    repo_path: String,
    name: String,
    url: String,
) -> Result<Vec<RemoteInfo>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::add_remote(&worktree, &name, &url)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_remote_url(
    repo_path: String,
    name: String,
    url: String,
) -> Result<Vec<RemoteInfo>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::set_remote_url(&worktree, &name, &url)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_remote_branches(repo_path: String) -> Result<Vec<RemoteBranchInfo>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::remote_branches(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn restore_remote_branch(
    repo_path: String,
    remote: String,
    branch: String,
) -> Result<RepositorySnapshot, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::restore_remote_branch(&worktree, &remote, &branch)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_remote(
    repo_path: String,
    name: String,
    url: String,
) -> Result<Vec<RemoteInfo>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::set_remote(&worktree, &name, &url)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn fetch_remote(repo_path: String) -> Result<SyncResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::fetch(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn pull_current_branch(repo_path: String) -> Result<SyncResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::pull(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn push_current_branch(repo_path: String) -> Result<SyncResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::push(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn merge_branch(
    repo_path: String,
    source_branch: String,
) -> Result<git_engine::MergeResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::merge_branch(&worktree, &source_branch)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn merge_branch_squash(
    repo_path: String,
    source_branch: String,
) -> Result<git_engine::MergeResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::merge_branch_squash(&worktree, &source_branch)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn squash_merge_abort(repo_path: String) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::abort_squash(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn merge_abort(repo_path: String) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::merge_abort(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn open_merge_tool(
    repo_path: String,
    path: String,
) -> Result<RepositorySnapshot, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::open_merge_tool(&worktree, &path)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn mark_conflict_resolved(
    repo_path: String,
    path: String,
) -> Result<RepositorySnapshot, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::mark_resolved(&worktree, &path)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_reflog(repo_path: String, limit: u32) -> Result<Vec<ReflogEntry>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::reflog(&worktree, limit)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stash_push(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::stash_push(&worktree, message.as_deref(), include_untracked)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stash_list(repo_path: String) -> Result<Vec<StashEntry>, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::stash_list(&worktree)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stash_apply(
    repo_path: String,
    index: usize,
    restore_index: bool,
) -> Result<git_engine::StashResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::stash_apply(&worktree, index, restore_index)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stash_pop(
    repo_path: String,
    index: usize,
    restore_index: bool,
) -> Result<git_engine::StashResult, GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::stash_pop(&worktree, index, restore_index)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stash_drop(repo_path: String, index: usize) -> Result<(), GitError> {
    run_blocking(move || {
        let worktree = git_engine::safe_repo_path(&repo_path)?;
        git_engine::stash_drop(&worktree, index)
    })
    .await
}

fn ui_config_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, GitError> {
    app.path()
        .app_config_dir()
        .map_err(|error| GitError::io(format!("无法解析 UI 配置目录：{error}")))
}

#[tauri::command]
pub async fn load_ui_state(app: tauri::AppHandle) -> Result<UiState, GitError> {
    let config_dir = ui_config_dir(&app)?;
    run_blocking(move || crate::ui_state::load_at(&config_dir)).await
}

#[tauri::command]
pub async fn save_ui_preferences(
    app: tauri::AppHandle,
    theme: String,
    font_scale: f64,
) -> Result<(), GitError> {
    let config_dir = ui_config_dir(&app)?;
    run_blocking(move || crate::ui_state::save_preferences_at(&config_dir, &theme, font_scale))
        .await
}

#[tauri::command]
pub async fn save_repo_list(
    app: tauri::AppHandle,
    repos: Vec<RepoEntryInput>,
) -> Result<Vec<RepoEntry>, GitError> {
    let config_dir = ui_config_dir(&app)?;
    run_blocking(move || crate::ui_state::save_repos_at(&config_dir, repos)).await
}
