use std::path::Path;

use super::command::{output_failure, run_git, run_git_checked};
use super::diff;
use super::error::GitError;
use super::repository;
use super::status;
use super::types::{MergeOutcome, MergeResult, RepositorySnapshot};

pub(crate) fn merge_branch(worktree: &Path, source_branch: &str) -> Result<MergeResult, GitError> {
    let source = source_branch.trim();
    if source.is_empty() {
        return Err(GitError::invalid_input("请选择要合并的分支。"));
    }
    if source.starts_with('-')
        || source
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err(GitError::invalid_input("分支名无效。"));
    }
    let valid = run_git(worktree, ["check-ref-format", "--branch", source])?;
    if !valid.status.success() {
        return Err(GitError::invalid_input("分支名不符合 Git 命名规则。"));
    }

    let data = status::read(worktree)?;
    if data.head.branch.as_deref() == Some(source) {
        return Err(GitError::invalid_input("不能把当前分支合并到自身。"));
    }
    if !data.summary.is_clean {
        let changes = data.summary.staged
            + data.summary.unstaged
            + data.summary.untracked
            + data.summary.conflicted;
        return Err(GitError::worktree_dirty(format!(
            "工作区还有 {changes} 项未提交修改，已阻止合并。请先提交或丢弃这些修改；不会自动 stash。"
        )));
    }
    let exists = run_git(
        worktree,
        [
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/heads/{source}"),
        ],
    )?;
    if !exists.status.success() {
        return Err(GitError::invalid_input(format!(
            "本地分支“{source}”不存在。"
        )));
    }

    let output = run_git(worktree, ["merge", "--no-edit", source])?;
    let snapshot = repository::snapshot_at_root(worktree)?;
    match output.status.code() {
        Some(0) => Ok(MergeResult {
            outcome: MergeOutcome::Success,
            source_branch: source.to_owned(),
            conflicts: Vec::new(),
            snapshot,
        }),
        Some(1) if !snapshot.files.conflicted.is_empty() => Ok(MergeResult {
            outcome: MergeOutcome::Conflict,
            source_branch: source.to_owned(),
            conflicts: snapshot
                .files
                .conflicted
                .iter()
                .map(|file| file.path.clone())
                .collect(),
            snapshot,
        }),
        _ => Err(output_failure(&output)),
    }
}

pub(crate) fn open_merge_tool(worktree: &Path, path: &str) -> Result<RepositorySnapshot, GitError> {
    let path = diff::validate_relative_path(path, "冲突文件路径")?;
    ensure_conflicted(worktree, &path)?;

    let tool = run_git(worktree, ["config", "--get", "merge.tool"])?;
    if !tool.status.success() {
        return Err(GitError::invalid_input(
            "未配置 Git merge.tool。请先使用 git config 配置外部合并工具。",
        ));
    }

    run_git_checked(
        worktree,
        [
            "-c",
            "mergetool.keepBackup=false",
            "mergetool",
            "--no-prompt",
            "--",
            path.as_str(),
        ],
    )?;

    repository::snapshot_at_root(worktree)
}

pub(crate) fn mark_resolved(worktree: &Path, path: &str) -> Result<RepositorySnapshot, GitError> {
    let path = diff::validate_relative_path(path, "冲突文件路径")?;
    ensure_conflicted(worktree, &path)?;
    run_git_checked(worktree, ["add", "--", path.as_str()])?;
    repository::snapshot_at_root(worktree)
}

fn ensure_conflicted(worktree: &Path, path: &str) -> Result<(), GitError> {
    let data = status::read(worktree)?;
    if !data.files.conflicted.iter().any(|file| file.path == path) {
        return Err(GitError::invalid_input(
            "该文件当前不在冲突状态，无法执行冲突操作。",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    fn git(repo: &Path, args: &[&str]) -> std::process::Output {
        Command::new("git")
            .current_dir(repo)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .expect("git")
    }

    fn must(repo: &Path, args: &[&str]) {
        let output = git(repo, args);
        assert!(
            output.status.success(),
            "git {:?}: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn init_repo() -> tempfile::TempDir {
        let temp = tempfile::tempdir().expect("temp");
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).expect("repo");
        must(&repo, &["init", "-q", "-b", "main"]);
        must(&repo, &["config", "user.name", "Merge Tester"]);
        must(&repo, &["config", "user.email", "merge@example.com"]);
        fs::write(repo.join("file.txt"), "base\n").expect("file");
        must(&repo, &["add", "file.txt"]);
        must(&repo, &["commit", "-q", "-m", "base"]);
        temp
    }

    #[test]
    fn merges_branch_and_reports_conflicts() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        must(&repo, &["checkout", "-q", "-b", "feature"]);
        fs::write(repo.join("feature.txt"), "feature\n").expect("feature");
        must(&repo, &["add", "feature.txt"]);
        must(&repo, &["commit", "-q", "-m", "feature work"]);
        must(&repo, &["checkout", "-q", "main"]);
        let result = merge_branch(&repo, "feature").expect("merge");
        assert_eq!(result.outcome, MergeOutcome::Success);
        assert_eq!(result.snapshot.commit_count, 2);

        must(&repo, &["checkout", "-q", "-b", "conflict"]);
        fs::write(repo.join("file.txt"), "feature side\n").expect("feature side");
        must(&repo, &["add", "file.txt"]);
        must(&repo, &["commit", "-q", "-m", "feature conflict"]);
        must(&repo, &["checkout", "-q", "main"]);
        fs::write(repo.join("file.txt"), "main side\n").expect("main side");
        must(&repo, &["add", "file.txt"]);
        must(&repo, &["commit", "-q", "-m", "main conflict"]);
        let result = merge_branch(&repo, "conflict").expect("merge conflict");
        assert_eq!(result.outcome, MergeOutcome::Conflict);
        assert_eq!(result.conflicts, vec!["file.txt".to_owned()]);
        assert_eq!(result.snapshot.files.conflicted.len(), 1);
    }

    #[test]
    fn blocks_merge_with_dirty_worktree() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        must(&repo, &["checkout", "-q", "-b", "feature"]);
        fs::write(repo.join("feature.txt"), "feature\n").expect("feature");
        must(&repo, &["add", "feature.txt"]);
        must(&repo, &["commit", "-q", "-m", "feature"]);
        must(&repo, &["checkout", "-q", "main"]);
        fs::write(repo.join("file.txt"), "dirty\n").expect("dirty");

        let error = merge_branch(&repo, "feature").expect_err("dirty");
        assert_eq!(error.kind, super::super::error::GitErrorKind::WorktreeDirty);
    }
}
