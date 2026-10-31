use std::path::Path;

use super::command::{output_failure, run_git, run_git_checked, text_output};
use super::error::GitError;
use super::repo_state;
use super::status;

fn validate_target(worktree: &Path, target_sha: &str) -> Result<(), GitError> {
    if target_sha.is_empty()
        || target_sha.len() > 64
        || !target_sha
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(GitError::invalid_input("目标提交 SHA 无效。"));
    }

    let head = run_git(worktree, ["rev-parse", "--verify", "HEAD"])?;
    if !head.status.success() {
        return Err(GitError::invalid_input("当前仓库还没有提交，无法软回退。"));
    }

    let target = run_git(worktree, ["rev-parse", "--verify", "--quiet", target_sha])?;
    if !target.status.success() {
        return Err(GitError::invalid_input(format!(
            "目标提交“{target_sha}”不存在。"
        )));
    }

    let ancestor = run_git(
        worktree,
        ["merge-base", "--is-ancestor", target_sha, "HEAD"],
    )?;
    match ancestor.status.code() {
        Some(0) => Ok(()),
        Some(1) => Err(GitError::invalid_input(
            "目标提交不属于当前分支历史，无法软回退。",
        )),
        _ => Err(output_failure(&ancestor)),
    }
}

/// Counts commits that would be removed from the current branch tip.
pub(crate) fn soft_count(worktree: &Path, target_sha: &str) -> Result<u32, GitError> {
    validate_target(worktree, target_sha)?;
    let output = run_git(
        worktree,
        ["rev-list", "--count", "HEAD", "--not", target_sha],
    )?;
    if !output.status.success() {
        return Err(output_failure(&output));
    }
    text_output(&output.stdout)
        .parse::<u32>()
        .map_err(|_| GitError::invalid_output("无法解析软回退的提交数量。"))
}

/// Moves HEAD only. The index and worktree are deliberately left untouched.
pub(crate) fn soft_reset(worktree: &Path, target_sha: &str) -> Result<(), GitError> {
    validate_target(worktree, target_sha)?;
    repo_state::ensure_operation_allowed(worktree, "软回退")?;
    // Squash / stash conflicts leave no RepoState marker; refuse to move HEAD
    // while the index is still unmerged so the conflict cannot be orphaned.
    let data = status::read(worktree)?;
    if data.summary.conflicted > 0 {
        return Err(GitError::invalid_input(
            "当前存在未解决的冲突，无法软回退。请先完成或中止该操作。",
        ));
    }
    run_git_checked(worktree, ["reset", "--soft", target_sha])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    fn git(repo: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(repo)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .expect("git");
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn output(repo: &Path, args: &[&str]) -> String {
        let out = Command::new("git")
            .current_dir(repo)
            .args(args)
            .output()
            .expect("git");
        assert!(out.status.success());
        String::from_utf8_lossy(&out.stdout).trim().to_owned()
    }

    fn init_repo() -> tempfile::TempDir {
        let temp = tempfile::tempdir().expect("temp");
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).expect("repo");
        git(&repo, &["init", "-q", "-b", "main"]);
        git(&repo, &["config", "user.name", "Reset Tester"]);
        git(&repo, &["config", "user.email", "reset@example.com"]);
        for (index, content) in ["one", "two", "three"].iter().enumerate() {
            fs::write(repo.join("file.txt"), format!("{content}\n")).expect("file");
            git(&repo, &["add", "file.txt"]);
            git(&repo, &["commit", "-q", "-m", &format!("commit {index}")]);
        }
        temp
    }

    #[test]
    fn soft_reset_moves_head_and_keeps_changes_staged() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        let target = output(&repo, &["rev-parse", "HEAD~2"]);
        assert_eq!(soft_count(&repo, &target).expect("count"), 2);
        let before = fs::read_to_string(repo.join("file.txt")).expect("content");

        soft_reset(&repo, &target).expect("soft reset");

        assert_eq!(output(&repo, &["rev-parse", "HEAD"]), target);
        assert_eq!(
            fs::read_to_string(repo.join("file.txt")).expect("content after"),
            before
        );
        let status = output(&repo, &["status", "--short"]);
        assert!(status.starts_with("M "));
        assert_eq!(output(&repo, &["rev-list", "--count", "HEAD"]), "1");
    }

    #[test]
    fn rejects_soft_reset_while_index_has_conflicts() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        git(&repo, &["checkout", "-q", "-b", "side", "HEAD~1"]);
        fs::write(repo.join("file.txt"), "side\n").expect("side");
        git(&repo, &["commit", "-qam", "side"]);
        git(&repo, &["checkout", "-q", "main"]);

        // A squash merge conflict leaves the index unmerged without any
        // RepoState marker, which is exactly the case the guard targets.
        let squash = Command::new("git")
            .current_dir(&repo)
            .args(["merge", "--squash", "side"])
            .output()
            .expect("git");
        assert!(!squash.status.success());
        assert!(!repo.join(".git/MERGE_HEAD").exists());

        let target = output(&repo, &["rev-parse", "HEAD~1"]);
        let error = soft_reset(&repo, &target).expect_err("conflicted index");
        assert_eq!(
            error.kind,
            super::super::error::GitErrorKind::InvalidInput
        );
    }

    #[test]
    fn rejects_missing_and_non_ancestor_targets() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        git(&repo, &["branch", "side", "HEAD~1"]);
        git(&repo, &["checkout", "-q", "side"]);
        fs::write(repo.join("side.txt"), "side\n").expect("file");
        git(&repo, &["add", "side.txt"]);
        git(&repo, &["commit", "-q", "-m", "side"]);
        let side = output(&repo, &["rev-parse", "HEAD"]);
        git(&repo, &["checkout", "-q", "main"]);

        assert!(soft_reset(&repo, &"0".repeat(40)).is_err());
        let error = soft_reset(&repo, &side).expect_err("non ancestor");
        assert_eq!(error.kind, super::super::error::GitErrorKind::InvalidInput);
    }
}
