use std::path::Path;

use super::command::{output_failure, run_git, run_git_checked};
use super::error::GitError;
use super::repository;
use super::status;
use super::types::{RepositorySnapshot, RevertOutcome, RevertResult};

pub(crate) fn revert_commit(worktree: &Path, sha: &str) -> Result<RevertResult, GitError> {
    let sha = validate_sha(sha)?;
    let snapshot = repository::snapshot_at_root(worktree)?;
    if snapshot.revert_in_progress {
        return Ok(result(
            RevertOutcome::InProgress,
            "已有 revert 正在进行，请先 continue 或 abort。",
            snapshot,
        ));
    }
    let data = status::read(worktree)?;
    if !data.summary.is_clean {
        return Err(GitError::worktree_dirty(
            "工作区有未提交修改，已阻止 Revert。请先提交或丢弃这些修改。",
        ));
    }

    let output = run_git(worktree, ["revert", "--no-edit", sha.as_str()])?;
    let snapshot = repository::snapshot_at_root(worktree)?;
    if output.status.success() && !snapshot.revert_in_progress {
        return Ok(result(RevertOutcome::Success, "Revert 完成。", snapshot));
    }
    if output.status.code() == Some(1) || snapshot.revert_in_progress {
        return Ok(result(
            RevertOutcome::Conflict,
            "Revert 产生冲突，等待解决后 continue 或 abort。",
            snapshot,
        ));
    }
    let error = output_failure(&output);
    Ok(result(RevertOutcome::OtherError, &error.message, snapshot))
}

pub(crate) fn revert_continue(worktree: &Path) -> Result<RevertResult, GitError> {
    let snapshot = repository::snapshot_at_root(worktree)?;
    if !snapshot.revert_in_progress {
        return Err(GitError::invalid_input("当前没有进行中的 revert。"));
    }
    if !snapshot.files.conflicted.is_empty() {
        return Err(GitError::invalid_input(
            "仍有未解决的冲突文件，必须先标记为解决后再 continue。",
        ));
    }

    let output = run_git(worktree, ["revert", "--continue"])?;
    let snapshot = repository::snapshot_at_root(worktree)?;
    if output.status.success() && !snapshot.revert_in_progress {
        return Ok(result(
            RevertOutcome::Success,
            "Revert continue 完成。",
            snapshot,
        ));
    }
    if output.status.code() == Some(1) || snapshot.revert_in_progress {
        return Ok(result(
            RevertOutcome::Conflict,
            "Revert continue 仍有冲突。",
            snapshot,
        ));
    }
    let error = output_failure(&output);
    Ok(result(RevertOutcome::OtherError, &error.message, snapshot))
}

pub(crate) fn revert_abort(worktree: &Path) -> Result<RevertResult, GitError> {
    let snapshot = repository::snapshot_at_root(worktree)?;
    if !snapshot.revert_in_progress {
        return Err(GitError::invalid_input("当前没有进行中的 revert。"));
    }
    run_git_checked(worktree, ["revert", "--abort"])?;
    let snapshot = repository::snapshot_at_root(worktree)?;
    Ok(result(RevertOutcome::Success, "Revert 已中止。", snapshot))
}

fn validate_sha(sha: &str) -> Result<String, GitError> {
    let sha = sha.trim();
    if (sha.len() != 40 && sha.len() != 64)
        || !sha.chars().all(|character| character.is_ascii_hexdigit())
    {
        return Err(GitError::invalid_input(
            "Revert 目标必须是完整 commit SHA。",
        ));
    }
    Ok(sha.to_owned())
}

fn result(outcome: RevertOutcome, message: &str, snapshot: RepositorySnapshot) -> RevertResult {
    RevertResult {
        outcome,
        conflicts: snapshot
            .files
            .conflicted
            .iter()
            .map(|file| file.path.clone())
            .collect(),
        message: message.to_owned(),
        snapshot,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    fn git(repo: &Path, args: &[&str]) -> std::process::Output {
        Command::new("git")
            .current_dir(repo)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_EDITOR", "true")
            .output()
            .expect("git")
    }

    fn must(repo: &Path, args: &[&str]) -> String {
        let output = git(repo, args);
        assert!(
            output.status.success(),
            "git {:?}: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_owned()
    }

    fn commit(repo: &Path, message: &str) -> String {
        must(repo, &["add", "-A"]);
        must(repo, &["commit", "-q", "-m", message]);
        must(repo, &["rev-parse", "HEAD"])
    }

    fn setup() -> (tempfile::TempDir, std::path::PathBuf) {
        let temp = tempfile::tempdir().expect("temp");
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).expect("repo");
        must(&repo, &["init", "-q", "-b", "main"]);
        must(&repo, &["config", "user.name", "Revert Tester"]);
        must(&repo, &["config", "user.email", "revert@example.com"]);
        (temp, repo)
    }

    #[test]
    fn reverts_clean_commit() {
        let (_temp, repo) = setup();
        fs::write(repo.join("file.txt"), "base\n").expect("base");
        let base = commit(&repo, "base");
        fs::write(repo.join("file.txt"), "changed\n").expect("changed");
        let changed = commit(&repo, "change");
        assert_ne!(base, changed);

        let result = revert_commit(&repo, &changed).expect("revert");
        assert_eq!(result.outcome, RevertOutcome::Success);
        assert!(!result.snapshot.revert_in_progress);
        assert_eq!(
            fs::read_to_string(repo.join("file.txt"))
                .expect("content")
                .replace("\r\n", "\n"),
            "base\n"
        );
    }

    #[test]
    fn conflict_continue_requires_resolution_and_abort_clears_state() {
        let (_temp, repo) = setup();
        fs::write(repo.join("file.txt"), "base\n").expect("base");
        commit(&repo, "base");
        fs::write(repo.join("file.txt"), "second\n").expect("second");
        let second = commit(&repo, "second");
        fs::write(repo.join("file.txt"), "third\n").expect("third");
        commit(&repo, "third");

        let result = revert_commit(&repo, &second).expect("revert conflict");
        assert_eq!(result.outcome, RevertOutcome::Conflict);
        assert!(result.snapshot.revert_in_progress);
        assert!(!result.conflicts.is_empty());
        assert!(revert_continue(&repo).is_err());

        fs::write(repo.join("file.txt"), "resolved\n").expect("resolve");
        must(&repo, &["add", "file.txt"]);
        let result = revert_continue(&repo).expect("continue");
        assert_eq!(result.outcome, RevertOutcome::Success);
        assert!(!result.snapshot.revert_in_progress);

        fs::write(repo.join("file.txt"), "fourth\n").expect("fourth");
        let fourth = commit(&repo, "fourth");
        fs::write(repo.join("file.txt"), "fifth\n").expect("fifth");
        commit(&repo, "fifth");
        let result = revert_commit(&repo, &fourth).expect("second conflict");
        assert_eq!(result.outcome, RevertOutcome::Conflict);
        let result = revert_abort(&repo).expect("abort");
        assert_eq!(result.outcome, RevertOutcome::Success);
        assert!(!result.snapshot.revert_in_progress);
    }
}
