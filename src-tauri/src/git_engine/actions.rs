use std::path::Path;
use std::thread;

use super::command::{output_failure, run_git, run_git_checked, text_output};
use super::config;
use super::diff;
use super::error::GitError;
use super::repository;
use super::status;
use super::sync;
use super::types::{
    CommitPushResult, CommitResult, DiffScope, FileDiff, PushOutcome, RepositorySnapshot,
};

/// Stage a complete file. Hunk-level staging will be added as a separate command
/// over a patch target rather than by changing the file-row API.
pub(crate) fn stage_file(worktree: &Path, path: &str) -> Result<RepositorySnapshot, GitError> {
    let path = diff::validate_relative_path(path, "文件路径")?;
    run_git_checked(worktree, ["add", "--", path.as_str()])?;
    repository::snapshot_at_root(worktree)
}

pub(crate) fn unstage_file(
    worktree: &Path,
    path: &str,
    original_path: Option<&str>,
) -> Result<RepositorySnapshot, GitError> {
    let path = diff::validate_relative_path(path, "文件路径")?;
    let original_path = original_path
        .map(|value| diff::validate_relative_path(value, "原文件路径"))
        .transpose()?;
    let mut paths = vec![path];
    if let Some(original_path) = original_path {
        paths.push(original_path);
    }

    if has_head(worktree)? {
        let mut args = vec!["restore", "--staged", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git_checked(worktree, args)?;
    } else {
        let mut args = vec!["reset", "--quiet", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git_checked(worktree, args)?;
    }

    repository::snapshot_at_root(worktree)
}

pub(crate) fn discard_file(
    worktree: &Path,
    path: &str,
    original_path: Option<&str>,
) -> Result<RepositorySnapshot, GitError> {
    let path = diff::validate_relative_path(path, "文件路径")?;
    let original_path = original_path
        .map(|value| diff::validate_relative_path(value, "原文件路径"))
        .transpose()?;
    let mut args = vec!["restore".to_owned(), "--".to_owned(), path];
    if let Some(original) = original_path {
        args.push(original);
    }
    run_git_checked(worktree, args)?;
    repository::snapshot_at_root(worktree)
}

pub(crate) fn staged_diffs(
    worktree: &Path,
    offset: u32,
    limit: u32,
) -> Result<Vec<FileDiff>, GitError> {
    let status = status::read(worktree)?;
    let limit = limit.clamp(1, 100) as usize;
    let offset = offset as usize;
    let files: Vec<_> = status
        .files
        .staged
        .iter()
        .skip(offset)
        .take(limit)
        .collect();

    if files.is_empty() {
        return Ok(Vec::new());
    }

    // A single-file `git diff` costs a process spawn. For a page of files we
    // run a small batch in parallel; the dialog only asks for the first page
    // until the user explicitly loads more.
    let mut diffs = Vec::with_capacity(files.len());
    for chunk in files.chunks(6) {
        let chunk_diffs = thread::scope(|scope| {
            let handles: Vec<_> = chunk
                .iter()
                .map(|file| {
                    let path = file.path.clone();
                    let original_path = file.original_path.clone();
                    scope.spawn(move || {
                        diff::read(worktree, &path, original_path.as_deref(), DiffScope::Staged)
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| {
                    handle
                        .join()
                        .map_err(|_| GitError::internal("读取暂存 diff 的后台线程异常。"))
                })
                .collect::<Vec<_>>()
        });

        for result in chunk_diffs {
            diffs.push(result??);
        }
    }

    Ok(diffs)
}

pub(crate) fn amend(
    worktree: &Path,
    message: Option<&str>,
    include_staged: bool,
) -> Result<(), GitError> {
    if !has_head(worktree)? {
        return Err(GitError::invalid_input("仓库还没有提交，无法 Amend。"));
    }
    let message = message.map(str::trim).filter(|value| !value.is_empty());
    let data = status::read(worktree)?;
    if !include_staged && data.summary.staged > 0 {
        return Err(GitError::invalid_input(
            "当前有已暂存文件；如要一起补入，请勾选“包含当前暂存文件”。",
        ));
    }

    config::ensure_identity(worktree)?;

    let mut args = vec!["commit", "--amend"];
    if let Some(message) = message {
        args.push("-m");
        args.push(message);
    } else {
        args.push("--no-edit");
    }
    run_git_checked(worktree, args)?;
    Ok(())
}

pub(crate) fn commit(
    worktree: &Path,
    title: &str,
    body: Option<&str>,
    no_verify: bool,
) -> Result<CommitResult, GitError> {
    commit_with_author(worktree, title, body, None, None, no_verify)
}

pub(crate) fn commit_with_author(
    worktree: &Path,
    title: &str,
    body: Option<&str>,
    author_name: Option<&str>,
    author_email: Option<&str>,
    no_verify: bool,
) -> Result<CommitResult, GitError> {
    let title = validate_title(title)?;
    let body = body.map(str::trim).filter(|value| !value.is_empty());
    let author = match (author_name, author_email) {
        (Some(name), Some(email)) => Some(validate_author(name, email)?),
        (None, None) => None,
        _ => {
            return Err(GitError::invalid_input(
                "复用作者信息时必须同时提供作者名和邮箱。",
            ))
        }
    };

    let staged_check = run_git(worktree, ["diff", "--cached", "--quiet"])?;
    if staged_check.status.success() {
        return Err(GitError::invalid_input("当前没有已暂存的文件，无法提交。"));
    }
    if staged_check.status.code() != Some(1) {
        return Err(GitError::command_failed("检查暂存区失败。"));
    }

    config::ensure_identity(worktree)?;

    let mut args = vec!["commit"];
    if no_verify {
        args.push("--no-verify");
    }
    if let Some(author) = author.as_deref() {
        args.push("--author");
        args.push(author);
    }
    args.push("-m");
    args.push(title);
    if let Some(body) = body {
        args.push("-m");
        args.push(body);
    }
    let output = run_git(worktree, args)?;
    if !output.status.success() {
        let mut error = output_failure(&output);
        if output.stderr.is_empty() {
            error.message.push_str(
                "（提交被拒绝。若仓库配置了 Git 钩子、GPG 签名或提交者身份，请检查对应配置；也可以在“更多”中临时跳过钩子。）",
            );
        }
        return Err(error);
    }

    let oid = text_output(&run_git_checked(worktree, ["rev-parse", "HEAD"])?);
    let short_oid = text_output(&run_git_checked(
        worktree,
        ["rev-parse", "--short=8", "HEAD"],
    )?);
    if oid.is_empty() || short_oid.is_empty() {
        return Err(GitError::invalid_output("提交成功，但无法读取新的 HEAD。"));
    }

    Ok(CommitResult {
        oid,
        short_oid,
        snapshot: repository::snapshot_at_root(worktree)?,
    })
}

fn validate_author(name: &str, email: &str) -> Result<String, GitError> {
    let name = name.trim();
    let email = email.trim();
    if name.is_empty()
        || email.is_empty()
        || name.chars().any(char::is_control)
        || email.chars().any(|character| {
            character.is_control() || character.is_whitespace() || matches!(character, '<' | '>')
        })
        || !email.contains('@')
    {
        return Err(GitError::invalid_input("复用的作者名或邮箱格式无效。"));
    }
    Ok(format!("{name} <{email}>"))
}

pub(crate) fn commit_and_push(
    worktree: &Path,
    title: &str,
    body: Option<&str>,
    no_verify: bool,
) -> Result<CommitPushResult, GitError> {
    commit_and_push_with_author(worktree, title, body, None, None, no_verify)
}

pub(crate) fn commit_and_push_with_author(
    worktree: &Path,
    title: &str,
    body: Option<&str>,
    author_name: Option<&str>,
    author_email: Option<&str>,
    no_verify: bool,
) -> Result<CommitPushResult, GitError> {
    let commit = commit_with_author(worktree, title, body, author_name, author_email, no_verify)?;
    let push_result = sync::push(worktree);
    match push_result {
        Ok(pushed) => Ok(CommitPushResult {
            commit_sha: commit.oid,
            commit_short_sha: commit.short_oid,
            push: PushOutcome::Success,
            push_message: "提交已推送。".to_owned(),
            snapshot: pushed.snapshot,
        }),
        Err(error) => {
            let outcome = classify_push_error(&error);
            Ok(CommitPushResult {
                commit_sha: commit.oid,
                commit_short_sha: commit.short_oid,
                push: outcome,
                push_message: error.message,
                snapshot: commit.snapshot,
            })
        }
    }
}

fn classify_push_error(error: &GitError) -> PushOutcome {
    if error.kind == super::error::GitErrorKind::Timeout {
        return PushOutcome::NetworkError;
    }
    let message = error.message.to_lowercase();
    let auth_markers = [
        "authentication failed",
        "permission denied",
        "could not read username",
        "could not read password",
        "invalid username or password",
        "access denied",
        "401",
        "403",
        "support for password authentication",
    ];
    if auth_markers.iter().any(|marker| message.contains(marker)) {
        return PushOutcome::AuthFailed;
    }
    let non_fast_forward_markers = [
        "non-fast-forward",
        "updates were rejected",
        "fetch first",
        "failed to push some refs",
        "! [rejected]",
    ];
    if non_fast_forward_markers
        .iter()
        .any(|marker| message.contains(marker))
    {
        return PushOutcome::NonFastForward;
    }
    let network_markers = [
        "could not resolve host",
        "unable to access",
        "connection refused",
        "connection reset",
        "timed out",
        "network is unreachable",
        "failed to connect",
        "could not read from remote repository",
        "ssl",
        "proxy",
    ];
    if network_markers
        .iter()
        .any(|marker| message.contains(marker))
    {
        return PushOutcome::NetworkError;
    }
    PushOutcome::Other
}

fn validate_title(title: &str) -> Result<&str, GitError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(GitError::invalid_input("提交标题不能为空。"));
    }
    if title
        .chars()
        .any(|character| character == '\0' || character == '\n' || character == '\r')
    {
        return Err(GitError::invalid_input("提交标题不能包含换行或控制字符。"));
    }
    Ok(title)
}

fn has_head(worktree: &Path) -> Result<bool, GitError> {
    let output = run_git(worktree, ["rev-parse", "--verify", "--quiet", "HEAD"])?;
    Ok(output.status.success())
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
            .expect("git should be available for integration tests");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn init_repo() -> tempfile::TempDir {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).expect("repo dir");
        git(&repo, &["init", "-q", "-b", "main"]);
        git(&repo, &["config", "--local", "user.name", "Action Tester"]);
        git(
            &repo,
            &["config", "--local", "user.email", "actions@example.com"],
        );
        fs::write(repo.join("tracked.txt"), "base\n").expect("fixture file");
        git(&repo, &["add", "tracked.txt"]);
        git(&repo, &["commit", "-q", "-m", "initial"]);
        temp
    }

    #[test]
    fn pages_staged_file_diffs() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        for name in ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"] {
            fs::write(repo.join(name), format!("{name}\n")).expect("new file");
        }
        git(&repo, &["add", "-A"]);

        let page = staged_diffs(&repo, 1, 2).expect("first page");
        assert_eq!(page.len(), 2);
        assert_eq!(page[0].path, "b.txt");
        assert_eq!(page[1].path, "c.txt");

        let last = staged_diffs(&repo, 4, 2).expect("last page");
        assert_eq!(last.len(), 1);
        assert_eq!(last[0].path, "e.txt");

        assert!(staged_diffs(&repo, 99, 2)
            .expect("offset past end")
            .is_empty());
    }

    #[test]
    fn stages_unstages_and_discards_complete_file() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        let file = repo.join("tracked.txt");
        fs::write(&file, "changed\n").expect("modify file");

        let snapshot = status_snapshot(&repo);
        assert_eq!(snapshot.files.unstaged.len(), 1);

        let snapshot = stage_file(&repo, "tracked.txt").expect("stage");
        assert!(snapshot.files.unstaged.is_empty());
        assert_eq!(snapshot.files.staged.len(), 1);

        let snapshot = unstage_file(&repo, "tracked.txt", None).expect("unstage");
        assert_eq!(snapshot.files.unstaged.len(), 1);
        assert!(snapshot.files.staged.is_empty());

        let snapshot = discard_file(&repo, "tracked.txt", None).expect("discard");
        assert!(snapshot.working_tree.is_clean);
        let content = fs::read_to_string(&file).expect("read file");
        assert_eq!(content.trim_end_matches(['\r', '\n']), "base");
    }

    #[test]
    fn commits_staged_file_and_returns_new_head() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        fs::write(repo.join("tracked.txt"), "changed for commit\n").expect("modify file");
        stage_file(&repo, "tracked.txt").expect("stage");

        let result = commit(&repo, "feat: stage two", Some("body text"), false).expect("commit");
        assert!(!result.oid.is_empty());
        assert_eq!(result.snapshot.working_tree.staged, 0);
        assert_eq!(result.snapshot.commit_count, 2);
        assert_eq!(
            result.snapshot.head.oid.as_deref(),
            Some(result.oid.as_str())
        );

        let history = super::super::log::list(&repo, 0, 10).expect("history");
        assert_eq!(history.commits[0].subject, "feat: stage two");
    }

    #[test]
    fn amends_files_and_message_without_adding_a_commit() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        let count = || {
            text_output(&run_git_checked(&repo, ["rev-list", "--count", "HEAD"]).expect("count"))
        };
        let subject =
            || text_output(&run_git_checked(&repo, ["log", "-1", "--format=%s"]).expect("subject"));

        fs::write(repo.join("tracked.txt"), "amended content\n").expect("modify");
        stage_file(&repo, "tracked.txt").expect("stage");
        amend(&repo, None, true).expect("amend files");
        assert_eq!(count(), "1");
        assert_eq!(subject(), "initial");
        assert_eq!(
            fs::read_to_string(repo.join("tracked.txt"))
                .expect("content")
                .trim(),
            "amended content"
        );

        amend(&repo, Some("amended subject"), false).expect("amend message");
        assert_eq!(count(), "1");
        assert_eq!(subject(), "amended subject");
    }

    #[test]
    fn amend_rejects_staged_changes_when_not_included() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        fs::write(repo.join("tracked.txt"), "staged only\n").expect("modify");
        stage_file(&repo, "tracked.txt").expect("stage");
        assert!(amend(&repo, None, false).is_err());
    }

    #[test]
    fn classifies_push_failures() {
        let error = |kind, message: &str| GitError {
            kind,
            message: message.to_owned(),
        };
        assert_eq!(
            classify_push_error(&error(
                super::super::error::GitErrorKind::Timeout,
                "timeout"
            )),
            PushOutcome::NetworkError
        );
        assert_eq!(
            classify_push_error(&error(
                super::super::error::GitErrorKind::CommandFailed,
                "fatal: Authentication failed for 'https://example.com'"
            )),
            PushOutcome::AuthFailed
        );
        assert_eq!(
            classify_push_error(&error(
                super::super::error::GitErrorKind::CommandFailed,
                "! [rejected] main -> main (non-fast-forward)"
            )),
            PushOutcome::NonFastForward
        );
        assert_eq!(
            classify_push_error(&error(
                super::super::error::GitErrorKind::CommandFailed,
                "fatal: unable to access: Could not resolve host"
            )),
            PushOutcome::NetworkError
        );
        assert_eq!(
            classify_push_error(&error(
                super::super::error::GitErrorKind::InvalidInput,
                "没有远程"
            )),
            PushOutcome::Other
        );
    }

    #[test]
    fn commits_with_explicit_author_override() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        fs::write(repo.join("tracked.txt"), "author\n").expect("modify");
        stage_file(&repo, "tracked.txt").expect("stage");
        commit_with_author(
            &repo,
            "authored commit",
            None,
            Some("Reused Author"),
            Some("reused@example.com"),
            false,
        )
        .expect("commit");
        let author = text_output(
            &run_git_checked(&repo, ["log", "-1", "--format=%an <%ae>"]).expect("author"),
        );
        assert_eq!(author, "Reused Author <reused@example.com>");
    }

    #[test]
    fn no_verify_skips_pre_commit_hook() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        let hooks = repo.join(".git").join("hooks");
        std::fs::create_dir_all(&hooks).expect("hooks");
        std::fs::write(hooks.join("pre-commit"), "#!/bin/sh\nexit 1\n").expect("hook");
        fs::write(repo.join("tracked.txt"), "hook test\n").expect("modify");
        stage_file(&repo, "tracked.txt").expect("stage");
        assert!(commit(&repo, "normal hook commit", None, false).is_err());
        assert!(commit(&repo, "skipped hook commit", None, true).is_ok());
    }

    #[test]
    fn rejects_empty_commit_title() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        fs::write(repo.join("tracked.txt"), "changed\n").expect("modify file");
        stage_file(&repo, "tracked.txt").expect("stage");
        assert!(commit(&repo, "   ", None, false).is_err());
    }

    fn status_snapshot(repo: &Path) -> RepositorySnapshot {
        repository::snapshot_at_root(repo).expect("snapshot")
    }
}
