use std::path::Path;

use super::command::run_git_remote;
use super::error::GitError;
use super::remote_auth;
use super::remotes;
use super::repo_state;
use super::repository;
use super::status;
use super::types::{SyncAction, SyncOutcome, SyncResult};

pub(crate) fn fetch(worktree: &Path) -> Result<SyncResult, GitError> {
    let remotes = remotes::list(worktree)?;
    if !remotes.iter().any(|remote| remote.name == "origin") {
        return Err(GitError::invalid_input(
            "当前仓库没有 origin 远程地址，请先在远程管理中配置。",
        ));
    }

    let output = run_git_remote(worktree, ["fetch", "--progress", "origin"])?;
    if !output.status.success() {
        return Err(remote_auth::failure(worktree, &output, Some("origin")));
    }
    let snapshot = repository::snapshot_at_root(worktree)?;

    Ok(SyncResult {
        action: SyncAction::Fetch,
        outcome: SyncOutcome::Completed,
        remote: "origin".to_owned(),
        branch: snapshot.head.branch.clone(),
        conflicts: snapshot.files.conflicted.len() as u32,
        snapshot,
    })
}

pub(crate) fn pull(worktree: &Path) -> Result<SyncResult, GitError> {
    repo_state::ensure_operation_allowed(worktree, "Pull")?;
    let data = status::read(worktree)?;
    if !data.summary.is_clean {
        return Err(GitError::worktree_dirty(
            "工作区有未提交修改，已阻止 Pull。请先提交、暂存或丢弃这些修改。",
        ));
    }
    let branch = data
        .head
        .branch
        .clone()
        .ok_or_else(|| GitError::invalid_input("当前处于游离 HEAD，无法 Pull。"))?;
    let upstream = data.head.upstream.clone().ok_or_else(|| {
        GitError::invalid_input("当前分支没有 upstream，请先 Push 并设置上游分支。")
    })?;
    let remote = upstream
        .split_once('/')
        .map(|(remote, _)| remote)
        .unwrap_or("origin")
        .to_owned();

    let output = run_git_remote(worktree, ["pull", "--no-rebase", "--no-edit", "--progress"])?;
    let snapshot = repository::snapshot_at_root(worktree)?;
    let conflict_count = snapshot.files.conflicted.len() as u32;
    let conflict_exit = output.status.code() == Some(1) && conflict_count > 0;

    if !output.status.success() && !conflict_exit {
        return Err(remote_auth::failure(worktree, &output, Some(&remote)));
    }
    if conflict_exit {
        return Ok(SyncResult {
            action: SyncAction::Pull,
            outcome: SyncOutcome::Conflict,
            remote,
            branch: Some(branch),
            conflicts: conflict_count,
            snapshot,
        });
    }

    Ok(SyncResult {
        action: SyncAction::Pull,
        outcome: SyncOutcome::Completed,
        remote,
        branch: Some(branch),
        conflicts: 0,
        snapshot,
    })
}

pub(crate) fn push(worktree: &Path) -> Result<SyncResult, GitError> {
    repo_state::ensure_operation_allowed(worktree, "Push")?;
    let data = status::read(worktree)?;
    if data.summary.conflicted > 0 {
        return Err(GitError::invalid_input(
            "存在未解决的冲突，无法 Push。请先解决并提交合并结果。",
        ));
    }
    let branch = data
        .head
        .branch
        .clone()
        .ok_or_else(|| GitError::invalid_input("当前处于游离 HEAD，无法 Push。"))?;
    let remotes = remotes::list(worktree)?;
    if remotes.is_empty() {
        return Err(GitError::invalid_input(
            "当前仓库没有远程地址，请先在远程管理中配置 origin。",
        ));
    }

    let (args, remote) = if let Some(upstream) = &data.head.upstream {
        (
            vec!["push".to_owned(), "--progress".to_owned()],
            upstream
                .split_once('/')
                .map(|(remote, _)| remote.to_owned())
                .unwrap_or_else(|| "origin".to_owned()),
        )
    } else {
        if !remotes.iter().any(|item| item.name == "origin") {
            return Err(GitError::invalid_input(
                "当前分支没有 upstream，且仓库没有 origin，无法首次 Push。",
            ));
        }
        (
            vec![
                "push".to_owned(),
                "--progress".to_owned(),
                "--set-upstream".to_owned(),
                "origin".to_owned(),
                branch.clone(),
            ],
            "origin".to_owned(),
        )
    };

    let output = run_git_remote(worktree, args)?;
    if !output.status.success() {
        return Err(remote_auth::failure(worktree, &output, Some(&remote)));
    }
    let snapshot = repository::snapshot_at_root(worktree)?;

    Ok(SyncResult {
        action: SyncAction::Push,
        outcome: SyncOutcome::Completed,
        remote,
        branch: Some(branch),
        conflicts: 0,
        snapshot,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;

    fn git(repo: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(repo)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_AUTHOR_DATE", "2026-01-01T00:00:00+00:00")
            .env("GIT_COMMITTER_DATE", "2026-01-01T00:00:00+00:00")
            .output()
            .expect("git should be available for integration tests");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn commit(repo: &Path, message: &str) {
        git(
            repo,
            &[
                "-c",
                "user.name=Sync Tester",
                "-c",
                "user.email=sync@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-q",
                "-m",
                message,
            ],
        );
    }

    fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let temp = tempfile::tempdir().expect("temp dir");
        let remote = temp.path().join("remote.git");
        let seeder = temp.path().join("seeder");
        fs::create_dir(&seeder).expect("seeder");
        git(&seeder, &["init", "-q", "-b", "main"]);
        git(&seeder, &["config", "--local", "user.name", "Sync Tester"]);
        git(
            &seeder,
            &["config", "--local", "user.email", "sync@example.com"],
        );
        fs::write(seeder.join("file.txt"), "base\n").expect("file");
        git(&seeder, &["add", "file.txt"]);
        commit(&seeder, "initial");
        git(
            temp.path(),
            &["init", "-q", "--bare", remote.to_str().expect("path")],
        );
        git(
            &seeder,
            &["remote", "add", "origin", remote.to_str().expect("path")],
        );
        git(&seeder, &["push", "-q", "-u", "origin", "main"]);
        git(&remote, &["symbolic-ref", "HEAD", "refs/heads/main"]);
        (temp, remote, seeder)
    }

    fn clone(remote: &Path, target: &Path) {
        git(
            target.parent().expect("parent"),
            &[
                "clone",
                "-q",
                remote.to_str().expect("remote"),
                target.to_str().expect("target"),
            ],
        );
        git(target, &["config", "--local", "user.name", "Sync Tester"]);
        git(
            target,
            &["config", "--local", "user.email", "sync@example.com"],
        );
    }

    #[test]
    fn commit_and_push_keeps_commit_when_push_fails() {
        let (temp, remote, _seeder) = setup();
        let work = temp.path().join("work");
        clone(&remote, &work);

        fs::write(work.join("file.txt"), "first local commit\n").expect("change");
        git(&work, &["add", "file.txt"]);
        let result =
            crate::git_engine::actions::commit_and_push(&work, "first commit", None, false)
                .expect("commit and push");
        assert_eq!(result.push, crate::git_engine::types::PushOutcome::Success);
        assert!(!result.commit_sha.is_empty());

        git(
            &work,
            &[
                "remote",
                "set-url",
                "origin",
                temp.path()
                    .join("missing.git")
                    .to_str()
                    .expect("missing path"),
            ],
        );
        fs::write(work.join("file.txt"), "second local commit\n").expect("change");
        git(&work, &["add", "file.txt"]);
        let result =
            crate::git_engine::actions::commit_and_push(&work, "second commit", None, false)
                .expect("commit remains");
        assert_ne!(result.push, crate::git_engine::types::PushOutcome::Success);
        assert!(!result.push_message.is_empty());
        let log_output = Command::new("git")
            .current_dir(&work)
            .args(["log", "-1", "--format=%s"])
            .output()
            .expect("git");
        let subject = String::from_utf8_lossy(&log_output.stdout);
        assert_eq!(subject.trim(), "second commit");
    }

    #[test]
    fn fetch_pull_and_push_against_local_remote() {
        let (temp, remote, _seeder) = setup();
        let first = temp.path().join("first");
        let second = temp.path().join("second");
        clone(&remote, &first);
        clone(&remote, &second);

        fs::write(first.join("file.txt"), "first update\n").expect("first update");
        git(&first, &["add", "file.txt"]);
        commit(&first, "first update");
        let pushed = push(&first).expect("push");
        assert_eq!(pushed.action, SyncAction::Push);

        let fetched = fetch(&second).expect("fetch");
        assert_eq!(fetched.action, SyncAction::Fetch);

        let pulled = pull(&second).expect("pull");
        assert_eq!(pulled.outcome, SyncOutcome::Completed);
        assert_eq!(
            fs::read_to_string(second.join("file.txt"))
                .expect("read file")
                .trim(),
            "first update"
        );
    }

    #[test]
    fn pull_conflict_reports_conflict_state() {
        let (temp, remote, _seeder) = setup();
        let first = temp.path().join("first");
        let second = temp.path().join("second");
        clone(&remote, &first);
        clone(&remote, &second);

        fs::write(first.join("file.txt"), "first side\n").expect("first side");
        git(&first, &["add", "file.txt"]);
        commit(&first, "first side");
        push(&first).expect("push first");

        fs::write(second.join("file.txt"), "second side\n").expect("second side");
        git(&second, &["add", "file.txt"]);
        commit(&second, "second side");
        let result = pull(&second).expect("pull returns conflict state");
        assert_eq!(result.outcome, SyncOutcome::Conflict);
        assert!(result.conflicts > 0);
        assert_eq!(result.snapshot.files.conflicted.len(), 1);
    }

    #[test]
    fn first_push_sets_upstream() {
        let (temp, remote, _seeder) = setup();
        let clone_dir = temp.path().join("first");
        clone(&remote, &clone_dir);
        git(&clone_dir, &["switch", "-q", "-c", "feature/new"]);
        fs::write(clone_dir.join("feature.txt"), "new\n").expect("feature");
        git(&clone_dir, &["add", "feature.txt"]);
        commit(&clone_dir, "feature");

        let result = push(&clone_dir).expect("first push");
        assert_eq!(
            result.snapshot.head.upstream.as_deref(),
            Some("origin/feature/new")
        );
    }
}
